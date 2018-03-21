# mup-deploy

Deploy script to tag version and deploy using Meteor up (mup)

This script helps manage versions in your meteor project.

The convention is that you have a git repo at the top level, and within it are one or more apps, within folders. 

eg 

```
admin-app
main-app
```

The names are not important, and you can have just one if you want.

Within each app there is a package.json file, and there is a version attribute - that's what this script uses.

## Conventions

## Processing

When you run the script (using npm) it does the following:

1) Checks that you are in either the `master` or `develop` branch, and that your repo is clean (ie no uncommitted files)
2) Checks that you are in the correct branch for your chosen deployment (prod targets must be in master branch, staging targets must be in develop)
3) Creates a git tag and pushes it to the repo
4) Templates the version number into your source tree
5) Commits and pushes that.
6) Runs mup deploy to deploy your target
