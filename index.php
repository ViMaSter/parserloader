<?php
	class ConfigParser
	{
		private $config = array();

		public function __construct()
		{
			$githubConfigFilename = "./github.conf";
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
			error_log(sprintf("\r\nGenerating hash from '%s'\r\n'%s'\r\nEquals: '%s'\r\nShould equal: '%s'", $data, $this->config["webhookSecret"], $dataHash, $suppliedHash));

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
			error_log(sprintf("Github WebHook reported a push onto a branch we're not concerned about! (branch: %s)", $webHookContent["ref"]));
		}
		else
		{
			error_log(sprintf("Github WebHook successfully reported a push. Updating branch executable. (branch: %s)", $webHookContent["ref"], $targetDirectory));
			list($scriptPath) = get_included_files();
			$scriptPath = realpath(dirname($scriptPath));
			exec(sprintf(
				"node %1$s %2$s %3$s &",
				"$scriptPath/updaterepoinstance.js",
				str_replace("/", "_", $webHookContent["ref"]),
				$webHookContent["head"]
			));
			error_log(sprintf("Github WebHook finished successfully. (branch: %s; directory: %s)", $webHookContent["ref"], $targetDirectory));
		}
	}
	else
	{
		error_log("Github WebHook signature could not be validated!");
	}
?>