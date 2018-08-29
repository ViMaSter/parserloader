// Initial setup
const del = require("del");
const path = require("path");
const fs = require('fs');
const util = require('util');
const execSync = require('child_process').execSync;

const commandLineArguments = process.argv.slice(2);
if (commandLineArguments.length != 3)
{
	console.error("Missing/too many command line arguments; expecting only repository clone-url, instance qualifier (mostly 'branch ref') and commithash")
	process.exit(1);
}

const CONFIG =
{
	"REPOSITORYURL": commandLineArguments[0],
	"BRANCH": commandLineArguments[1].replace("ref/heads/", ""),
	"INSTANCE": commandLineArguments[1].replace(/\//g, '_'),
	"COMMITHASH": commandLineArguments[2],
};

const TARGETPATH = path.join(__dirname, "..", CONFIG.INSTANCE, CONFIG.COMMITHASH);

const serviceFormat = "pdfparser-%s-%s";

// Error handling
function cleanup() {
	del.sync([path.join(TARGETPATH, "**")], {force: true});
};

function createFolders()
{
	console.log("Cloning repo '%s' to folder '%s' (instance '%s' at commit '%s')", CONFIG.REPOSITORYURL, TARGETPATH, CONFIG.INSTANCE, CONFIG.COMMITHASH);

	if (fs.existsSync(path.join(TARGETPATH, "..")))
	{
		console.log("Folder for this instance ('%s') already exists.", CONFIG.INSTANCE);
	}
	else
	{
		fs.mkdirSync(path.join(TARGETPATH, ".."));
	}

	if (fs.existsSync(path.join(TARGETPATH)))
	{
		console.log("Folder for this commit in instance ('%s', '%s') already exists. Was cleanup not executed properly?", CONFIG.INSTANCE, CONFIG.COMMITHASH);
		return false;
	}

	fs.mkdirSync(path.join(TARGETPATH));

	return true;
}

function cloneRepo()
{
	// Clone repo
	const gitCloneResult = execSync(util.format('git clone %s %s --branch %s', CONFIG.REPOSITORYURL, TARGETPATH, CONFIG.BRANCH), {stdio:[0,1,2]});
	return true;

}

function runInstall()
{
	// Run 'INSTALL.sh'
	const maxTries = 5;
	for (let i = 0; i < maxTries; i++)
	{
		try {
			execSync("npm cache clean --force", {cwd: TARGETPATH, stdio:[0,1,2]});
			execSync("npm install", {cwd: TARGETPATH, stdio:[0,1,2]});
			execSync("npm audit fix", {cwd: TARGETPATH, stdio:[0,1,2]});
			break;
		} 
		catch (error) {
			console.log("------- 'npm install' failed! try %d of %d -------", i+1, maxTries);
			console.log("Error code: " + error.status);
			console.log("Error message: " + error.message);
			console.log("--- STD ERR OUTPUT START ---");
			console.log(error.stderr);
			console.log("--- STD ERR OUTPUT  END  ---");
			console.log("--- STD OUT OUTPUT START ---");
			console.log(error.stdout);
			console.log("--- STD OUT OUTPUT  END  ---");
			console.log("------- 'npm install' failed! -------");
		}
	}

	return true;
}

function createService()
{
	// Create service based on new instance
	const templateContents = fs.readFileSync("./PDFparser.template.service", 'utf8');
	const preparedContents = util.format(
		templateContents,
		CONFIG.INSTANCE,
		CONFIG.COMMITHASH,
		TARGETPATH,
		TARGETPATH,
		TARGETPATH
	);

	const filename = util.format("/etc/systemd/system/"+serviceFormat+".service", CONFIG.INSTANCE, CONFIG.COMMITHASH);

	console.log("--- FILE: "+filename+" ---");
	console.log("--- WRITING TO FILE START ---");
	console.log(preparedContents);
	console.log("--- WRITING TO FILE  END  ---");

	fs.writeFileSync(filename, preparedContents, {flag: 'w'});

	return true;
}

function switchServices()
{
	const services = execSync('service --status-all');
	const expression = new RegExp(util.format(serviceFormat, CONFIG.INSTANCE, "-([0-9a-fA-F]*)"), "g");
	const result = services.toString().match(expression);
	if (result && result.length > 1)
	{
		const oldInstance = util.format(serviceFormat, CONFIG.INSTANCE, result[1]);
		[
			"systemctl stop %s",
			"systemctl disable %s",
			"rm /etc/systemd/system/%s",
			"systemctl daemon-reload",
			"systemctl reset-failed",
		].forEach(function(command)
		{
			try
			{
				execSync(util.format(command, oldInstance));
			}
			catch (exeception)
			{
				console.log("---- "+command)
				console.log("---- ERROR RUNNING EXIT COMMAND START ----")
				console.log(exeception)
				console.log("---- ERROR RUNNING EXIT COMMAND  END  ----")
			}
		});
	}

	const newInstance = util.format(serviceFormat, CONFIG.INSTANCE, CONFIG.COMMITHASH);
	[
		"systemctl enable %s",
		"systemctl start %s",
	].forEach(function(command)
	{
		try
		{
	 		execSync(util.format(command, newInstance));
		}
			catch (exeception)
			{
				console.log("---- "+command)
				console.log("---- ERROR RUNNING STARTUP COMMAND START ----")
				console.log(exeception)
				console.log("---- ERROR RUNNING STARTUP COMMAND  END  ----")
			}
	});

}
/*
if (!createFolders())
{
	cleanup();
	return;
}
if (!cloneRepo())
{
	cleanup();
	return;
}
if (!runInstall())
{
	cleanup();
	return;
}*/
if (!createService())
{
	cleanup();
	return;
}
if (!switchServices())
{
	cleanup();
	return;
}