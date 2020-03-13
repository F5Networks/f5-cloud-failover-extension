# Introduction

This directory contains all of the tests for this project.  This documentation is designed to make clear things that would otherwise be unclear.

## Unit

All unit tests are written using the [mocha](https://mochajs.org) framework, and run using ```npm run test``` during automated or manual test.

Triggered: Every commit pushed to central repository.

Best practices:

- Create a separate ```*Test.js``` for each source file being tested.
- Use a standard mocker:  Prefer [sinon](https://sinonjs.org). 
- Keep the folder structure flat, this project is not that large or complex.
- Monitor and enforce coverage, but avoid writing tests simply to increase coverage when there is no other perceived value.
- With that being said, **enforce coverage** in automated test.

## Functional

All functional tests reside inside the ```functional``` folder and are run using ```npm run functional-test``` from the repository root.

Prereqs:

- `npm install`

Best Practices:

- Clean up after yourself - although it is a fairly safe assumption to make that this is a fresh environment consider if it were multi-use when writing tests
- Consider carefully before testing things in functional test that should or could be tested via unit test - those are run more frequently
- Grab logs from the DUT to help determine failures - For example `restnoded.log` is collected and placed in the `logs` directory during every functional test run

### Environment

It is somewhat implied that running the functional tests requires a runtime (BIG-IP, container, etc.) to deploy the iLX extension, consumers, etc.  The current methodology is to deploy and subsequently teardown the runtime every time functional tests are run, with the understanding that functional tests will be run less frequently than unit tests.

To do automated environment creation this project makes use of `automation-sdk/deployment-tool`, please see that repository for more information.

#### Manual Environment Setup

Creating an environment manually using the same methodology as automated tests is entirely acceptable, in fact it is anticipated for development.  For more information, including usage, please see the `automation-sdk/deployment-tool` repository.

#### Quick Environment Setup

Creation and configuration of the environment can be done quickly using the below instructions. It builds the cloud failover extension RPM locally, creates the deployment, installs the RPM in the newly created deployment and runs all the functional tests. Once the command has executed look for the `deployment-info.json` file for information about the deployment, including access.

Prereqs:

- The `automation-sdk/deployment-tool` MUST be cloned to the same parent folder
- Prereqs declared in the `automation-sdk/deployment-tool` documentation MUST be met
- Environment Variable `CF_ENV_CLOUD` MUST be set (azure, aws, gcp)

Execute:

- `npm run deployment-setup`

## Misc Notes

- Deploy source code on to the environment BIG-IP(s) using scp: `bash scripts/deploy_source.sh`
