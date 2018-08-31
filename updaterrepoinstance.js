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

function updateService()
{	
	const servicesConfigContents = fs.readFileSync(path.join(__dirname, "services_config.json"), 'utf8');
	let parsedServicesConfigContents = {};
	if (servicesConfigContents)
	{
		parsedServicesConfigContents = JSON.parse(servicesConfigContents);
	}
	parsedServicesConfigContents[CONFIG.INSTANCE] = CONFIG.COMMITHASH;
	console.log("--- Updating service list...");
	console.log(parsedServicesConfigContents);
	console.log("---");
	console.log("--- Restarting parser monitor service...");
	fs.writeFileSync(path.join(__dirname, "services_config.json"), JSON.stringify(parsedServicesConfigContents), {flag: 'w'});
	const reloadParserMonitor = execSync("sudo /bin/systemctl restart parsermonitor.service");	
	console.log(reloadParserMonitor.toString());
	console.log("---");
}


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
}
if (!updateService())
{
	cleanup();
	return;
}
