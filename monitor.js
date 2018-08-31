const process = require("process");
const util = require("util");
const path = require("path");
const fs = require("fs");
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
	const servicesConfigContents = JSON.parse(fs.readFileSync("./services_config.json", 'utf8'));
	let processes = [];
	for (instance in servicesConfigContents)
	{
		processes.push(Process.FromData(instance, servicesConfigContents[instance]));
	}
	return processes;
}

function compareProcesses()
{
	let status =
	{
		"superflous": [],
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
	status["superflous"] = runningProcesses.filter(function(runningProcess) {
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

console.log(compareProcesses());

// update():
// load config 
// check current processes
//

// refresh():
// exit superflous processes
// start new processes

// update();
// refresh();