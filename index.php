<?php
	class ConfigParser
	{
		private $config = array();

		public function __construct()
		{
			$githubConfigFilename = "./github_config.json";
			$this->loadConfig($githubConfigFilename);
		}

		private function loadConfig($filename)
		{
			$fileContent = file_get_contents($filename);
			$this->config = json_decode($fileContent, true);
		}

		public function branchIsWhitelisted($branchName)
		{
			return in_array($branchName, $this->config["whitelist"]);
		}

		public function validateHash($data, $suppliedHash)
		{
			$dataHash = hash_hmac("sha1", $data, $this->config["webhookSecret"]);
			error_log(sprintf(
				"\r\nGenerating hash from '%s'\r\n'%s'\r\nEquals: '%s'\r\nShould equal: '%s'",
				$data,
				$this->config["webhookSecret"],
				$dataHash,
				$suppliedHash
			));

			return $dataHash == $suppliedHash;
		}
	}


	if (!function_exists('getallheaders'))  {
	    function getallheaders()
	    {
	        if (!is_array($_SERVER)) {
	            return array();
	        }

	        $headers = array();
	        foreach ($_SERVER as $name => $value) {
	            if (substr($name, 0, 5) == 'HTTP_') {
	                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
	            }
	        }
	        return $headers;
	    }
	}

	$template = "GET: %s\r\nPOST: %s\r\nHEADERS: %s\r\nBODY: %s\r\n";
	$getString = print_r($_GET, true);
	$postString = print_r($_POST, true);
	$headers = getallheaders();
	$entityBody = file_get_contents('php://input');

	/*
	Verbose debug code
	file_put_contents("./test.txt", sprintf($template, $getString, $postString, $headers, $entityBody));
	*/

	$configParser = new ConfigParser();
	if ($configParser->validateHash($entityBody, substr($headers["X-Hub-Signature"], 5)))
	{
		$webHookContent = json_decode(urldecode(substr($entityBody, 8)), true);
		if ($configParser->branchIsWhitelisted($webHookContent["ref"]))
		{
			error_log(sprintf(
				"Github WebHook reported a push onto a branch we're not concerned about! (branch: %s)",
				$webHookContent["ref"]
			));
		}
		else
		{
			error_log(sprintf(
				"Github WebHook successfully reported a push. Updating branch executable. (branch: %s)",
				$webHookContent["ref"]
			));
			list($scriptPath) = get_included_files();
			$scriptPath = realpath(dirname($scriptPath));
			exec(sprintf(
				"node %1$s %2$s %3$s &",
				"$scriptPath/updaterepoinstance.js",
				str_replace("/", "_", $webHookContent["ref"]),
				$webHookContent["head"]
			));

			// load current services config
			$serviceConfig = json_decode(file_get_contents("./service_config.json"), true);
			
			if (array_key_exists($webHookContent["ref"], $serviceConfig))
			{
				if ($serviceConfig[$webHookContent["ref"]] == $webHookContent["head"])
				{
					// bail early if commits for this instance are identical 
					error_log(sprintf(
						"Github WebHook finished successfully. Branch %s is sharing the same commit hash as we (%s) so execution is finished early.",
						$webHookContent["ref"],
						$webHookContent["head"]
					));
					return;
				}
				else
				{
					// otherwise be verbose and continue
					error_log(sprintf(
						"Github WebHook reported branch '%s' changing from commit '%s' to '%s'",
						$webHookContent["ref"],
						$serviceConfig[$webHookContent["ref"]],
						$webHookContent["head"]
					));
				}
			}
			else
			{
				error_log(sprintf(
					"Github WebHook new branch '%s'with commit '%s'",
					$webHookContent["ref"],
					$webHookContent["head"]
				));
			}

			$serviceConfig[$webHookContent["ref"]] = $webHookContent["head"];
			$newServiceConfig = json_encode($serviceConfig);
			file_put_contents("./service_config.json", $newServiceConfig, LOCK_EX);
			exec(sprintf("node %s/updaterrepoinstance.js %s %s %s &",
				dirname(__FILE__),
				$webHookContent["repository"]["clone_url"],
				$webHookContent["ref"],
				$webHookContent["head"]
			));
			error_log(sprintf("Github WebHook finished successfully. Reloading service. (Result %s)", exec("systemctl reload node")));
		}
	}
	else
	{
		error_log("Github WebHook signature could not be validated!");
	}
?>