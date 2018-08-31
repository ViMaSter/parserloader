console.log("---------- MONITOR START ----------")
const process = require("process");
process.on('exit', function()
{
	console.log("---------- MONITOR  END  ----------")
});

const util = require("util");
const path = require("path");
const fs = require("fs");
const exec = require("child_process").exec;
const execSync = require("child_process").execSync;

class Process
{
	constructor()
	{
		this.PID = -1;
		this.Instance = "";
		this.Hash = "";
	}
	static get WorkingDirectoryCommand()
	{
		return 'readlink -f "/proc/%d/cwd"';
	}
	static FromPID(pid)
	{
		let process = new Process();

		process.PID = pid;
		const splitDirectory = execSync(util.format(Process.WorkingDirectoryCommand, pid)).toString().trim().split(path.sep);
		process.Instance = splitDirectory[splitDirectory.length-2];
		process.Hash = splitDirectory[splitDirectory.length-1];

		return process;
	}
	static FromData(instance, hash)
	{
		let process = new Process();

		process.Instance = instance;
		process.Hash = hash;

		return process;
	}

	IsValid()
	{
		return 
			this.PID > -1 &&
			this.Instance.length > 0 &&
			this.Hash.length > 0;
	}
	IsRunning()
	{
		return this.PID > 0 && fs.existsSync("/proc/"+this.PID);
	}

	toString()
	{
		return `[PID ${this.PID > -1 ? this.PID : "NONE"} (instance ${this.Instance} - hash ${this.Hash})]`;
	}

	static AreSameStem(processA, processB)
	{
		return processA.Instance == processB.Instance && processA.Hash == processB.Hash;
	}
}

/// Retrieves every node process relevant to the parser and information about it
function getCurrentRunningProcesses()
{
	const parentFolder = path.join(__dirname, "..");

	const allNodeProcessIDs = execSync("pgrep node").toString().trim().split("\n");
	const relevantNodeProcessIDs = allNodeProcessIDs.filter(function(item)
	{
		const currentWorkingDirectory = execSync(util.format(Process.WorkingDirectoryCommand, item)).toString();
		return currentWorkingDirectory.startsWith(parentFolder) && item != process.pid;
	});
	let processInformation = [];
	relevantNodeProcessIDs.forEach(function(item)
	{
		processInformation.push(Process.FromPID(item));
	});

	return processInformation;
}

function getRequestedProcesses()
{
	let processes = [];

	const servicesConfigContents = fs.readFileSync(path.join(__dirname, "services_config.json"), 'utf8');
	if (!servicesConfigContents)
	{
		return processes;
	}

	const parsedServicesConfigContents = JSON.parse(servicesConfigContents);
	for (instance in parsedServicesConfigContents)
	{
		processes.push(Process.FromData(instance, parsedServicesConfigContents[instance]));
	}
	return processes;
}

function compareProcesses()
{
	let status =
	{
		"superfluous": [],
		"missing": [],
		"ok": []
	};
	const runningProcesses = getCurrentRunningProcesses();
	const requestedProcesses = getRequestedProcesses();
	for (const requestedIndex in requestedProcesses)
	{
		let exists = false;
		for (const runningIndex in runningProcesses)
		{
			if (Process.AreSameStem(requestedProcesses[requestedIndex], runningProcesses[runningIndex]))
			{
				status["ok"].push(runningProcesses[runningIndex])
				exists = true;
			}
		}
		if (!exists)
		{
			status["missing"].push(requestedProcesses[requestedIndex]);
		}
	}
	status["superfluous"] = runningProcesses.filter(function(runningProcess) {
		for (const index in requestedProcesses)
		{
			if (Process.AreSameStem(runningProcess, requestedProcesses[index]))
			{
				stillRequired = true;
				return false;
			}
		}
		return true;
	});

	return status;
}

let handler =
{
	"superfluous": function(process)
	{
		console.log(`--- Attempting to kill superfluous process ${process}`);
		console.log(execSync("kill -9 "+process.PID).toString());
		console.log("---------")
	},
	"missing": function(process)
	{
		let errorHandler = function (error, stdout, stderr) {
			if (error) {
				console.error(`+++ ERROR ${process}: ${error}`);
				return;
			}
			console.log(`stdout: ${stdout}`);
			console.log(`stderr: ${stderr}`);
		};

		console.log(`+++ ${process} Attempting to spawn process`);
		const targetPath = path.join(__dirname, "..", process.Instance, process.Hash);
		if (!fs.existsSync(path.join(targetPath, ".git")))
		{
			console.error(`+++ ${process} can not be spawned, as ${targetPath} does not exist and/or contains no cloned repository!`)
		}
		const command = `node ${targetPath}/index.js`;
		console.log(`+++ ${process} COMMAND: '${command}'`);
		const newProcess = exec(command, {
			cwd: targetPath
		}, errorHandler.bind(process));
		console.log("+++++++++")
	},
	"ok": function(process)
	{
		// void by design
		console.log(`||| ${process} matches requirements.`);
		console.log("|||||||||")
	}
}

function handleStatus(comparisionResults)
{
	for (key in comparisionResults)
	{
		for (index in comparisionResults[key])
		{
			handler[key](comparisionResults[key][index]);
		}
	}
}

handleStatus(compareProcesses());