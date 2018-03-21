#!/usr/local/bin/node
'use strict';

const _ = require('lodash');
const fs = require('fs');
const shell = require('shelljs/global');
const recursive = require('recursive-readdir');
require('shelljs/global');
const git = require('git-rev');
const gitTag = require('git-tag')({localOnly:true});
const gitStatus = require("git-status");

var pkg;

// the "opts" object will contain all the command line parameters and options
// So the first parameter will be in the opts._ array, eg the first one will be in opts._[0]
// eg if run with --debug, then opts.debug will be true
const opts = require('minimist')(process.argv.slice(2));

if (opts.help) {
	console.log(`
#Usage:
	npm run deploy-XXX -- [--help] [--minor|major] [--releases]
Where
	--minor will bump the minor version, eg 1.2.5 => 1.3.0
	--major will bump the major version, eg 1.2.5 => 2.0.0

NB: If you are specifying command line switches, you need to specify '--' in order for subsequent parameters to be passed through to the script
==  (otherwise command options are passsed to npm, which is not what you want)

#Prerequisites
	- Development environment, eg node/git etc

#Processing:
	This command will do the following
		- Bump the patch level version, eg 1.2.5 => 1.2.6 (unless --minor or --major is specified)
		- Do the mup deploy
		`);
	process.exit(0);
}

const BANG = '\n * * * * * * * FAILED * * * * * * * * *\n\n';
function ABORT(msg) {
	console.error(BANG+msg+'\n'+BANG);
	process.exit(1);
}

var tdir = "./templates";
try {
	fs.existsSync(tdir);
} catch (e) {
	throw new Error("Can't find templates directory "+e);
}

let level = '';
const choices = {
	'admin-prod': {
		app: 'admin-app',
		name: 'admin-prod',
		level: 'minor',
		branch: 'master'
	},
	'admin-demo': {
		app: 'admin-app',
		name: 'admin-demo',
		level: '',		// Assumes prod goes first, this picks up the same version
		branch: 'master'
	},
	'admin-staging': {
		app: 'admin-app',
		name: 'admin-staging',
		level: 'patch',
		branch: 'devel'
	},
	'admin-test': {
		app: 'admin-app',
		name: 'admin-test',
		level: '',
		branch: 'devel'
	},
	'survey-prod': {
		app: 'survey-app',
		name: 'survey-prod',
		level: 'minor',
		branch: 'master'
	},
	'survey-demo': {
		app: 'survey-app',
		name: 'survey-demo',
		level: '',		// Assumes prod goes first, this picks up the same version
		branch: 'master'
	},
	'survey-staging': {
		app: 'survey-app',
		name: 'survey-staging',
		level: 'patch',
		branch: 'devel'
	},
	'survey-test': {
		app: 'survey-app',
		name: 'survey-test',
		level: '',
		branch: 'devel'
	},
};

if (_.keys(choices).indexOf(opts._[0]) === -1) {
	ABORT("Fatal error: You must specify one of "+_.keys(choices).join(", "));
}
const choice = choices[opts._[0]];		// Get a reference to the choice made with the command line parameter
if (choice.level)
	level = choice.level;
if (!choice.app)
	choice.app = 'app';		// Provide a default to be safe

// Check the git status to make sure we are clean:
gitStatus((err, data) => {
  // console.log('gitStatus\n', err || data);
  // => [ { x: ' ', y: 'M', to: 'example/index.js', from: null } ]
  const dirty = [];
  _.each(data,row => {
  	if (row.from || row.y === 'M') {
  		dirty.push(row.to);
  	}
  });
  if (dirty.length) {
  	ABORT("Git is showing "+dirty.length+" dirty files, ("+dirty.join(", ")+") please fix and retry");
  }
  checkBranch();
});

function checkBranch() {
	git.branch(function (str) {
		pkg.branch = str;
		if (choice.branch !== '' && pkg.branch !== choice.branch) {
			ABORT("You need to be on the ["+choice.branch+"] branch to deploy to the '"+choice.name+"' server.");
		}
		const newtag = pkg.branch+"-v"+pkg.version;
		if (opts.debug)
			console.log("Adding tag ["+newtag+"]");
		pkg.tag = newtag;
	//	gitTag.create(newtag, 'Tag message '+pkg.when, function(err, res){
	//		if (err)
	//			console.error(err);
	//		console.log("Tag result:",res);
	//	});
		console.log("about to do templating");
		bumpVersion();
	});
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
//
// The first job is to bump the version (sometimes)
//
function bumpVersion() {
	if (level === '' && 0) {		// It messes up if you don't bump the version no
		console.info("Not bumping version no");
	} else {
		if (opts.minor) {
			level = "minor";
		} else {
			if (opts.major) {
				level = "major";
			}
		}
		const cmd = `cd ${choice.app} && npm version ${level} --no-git-tag-version -m "Deploying version to ${choice.name}] - - - - - - - -"`;
		if (!opts.nobump) {
			if (opts.debug)
			  console.log("Executing command: "+cmd);
			if (exec(cmd).code !== 0) {
			  ABORT('Error: version bump command failed ('+cmd+')');
			}
		}
	}
  doTemplating();
}
//
// Read the package file - specifically get the version
//
pkg = require(process.cwd()+`/${choice.app}/package.json`); // eslint-disable-line global-require
pkg.when = new Date();
git.long(function (str) {
	pkg.commit = str;
})

//
// We now do some templating of key config files
//
function doTemplating() {
	var basedir = process.cwd()+`/${choice.app}/`;

	if (opts.debug)
		console.log("cwd="+process.cwd());

	recursive(tdir, [], function (err, files) {
		if (err) {
			console.log("Recursion error: ",err)
		}
	  // Files is an array of filename
		if (opts.debug)
		  console.log(files);
		_.each(files,function(f) {
			console.log("Templating file "+f);
			var t = fs.readFileSync(f,'utf8');
			// if (opts.debug)
			//   console.log("template=",t);
			var tt = _.template(t);
			var buf = tt(pkg);
			var destf = f;
			destf = destf.replace("templates/",basedir);
			if (opts.debug)
			  console.log("writing ",destf);
			fs.writeFileSync(destf,buf);
		});
		console.log("Done templating");
		mainGame();
	});
}


// - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// The main game....
//
// Grab all the npm modules we need
// Compile the typescript files
// Now delete the unwanted npm modules
function mainGame() {
	const cmds = [];

	// cmds.push('npm run ms.template');
	cmds.push(`git diff --quiet && git diff --staged --quiet || git commit -am "Completed templating of ${choice.app}/${pkg.version}" && git pull`);
	cmds.push(`git tag -a v${pkg.version}.${choice.name} -m "Tag message ${pkg.when}"`);
	cmds.push("git push");
	cmds.push("git push --tags");

  cmds.push("echo Deploying files to remote server");
  var mupdir = "./deployment/"+choice.name+"/";
  var settingsFile = mupdir+"settings.json";
  var mupFile = mupdir+"mup.js";
  cmds.push("mup deploy --settings "+settingsFile+" --config "+mupFile);

	cmds.push("echo Done.");


	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	//
	// Run all the commands in sequence
	//
	_.each(cmds,(cmd) => {
		if (opts.debug)
			console.log("Executing command: "+cmd);
		if (exec(cmd).code !== 0) {
		  ABORT('Error: command failed ('+cmd+')');
		}
	});
}
