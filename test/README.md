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

All functional tests reside inside the ```functional``` folder and are run using ```npm run test-functional``` from the repository root.

Prereqs:

- `npm install`

Best Practices:

- Clean up after yourself - although it is a fairly safe assumption to make that this is a fresh environment consider if it were multi-use when writing tests
- Consider carefully before testing things in functional test that should or could be tested via unit test - those are run more frequently

### Environment

It is somewhat implied that running the functional tests requires a runtime (BIG-IP, container, etc.) to deploy the iLX extension, consumers, etc.  The current methodology is to deploy and subsequently teardown the runtime every time functional tests are run, with the understanding that functional tests will be run less frequently than unit tests.

#### Manual Environment Setup

Creating an environment manually using the same methodology as automated tests is entirely acceptable, in fact it is anticipated for development.  Below describes the commands to setup/teardown an environment.

Prereq:

- Terraform 0.12+
- Python 3.7+ (will create a virtual environment)
    - f5-cloud-cli package`
- Login to cloud provider CLI (TF uses the files each CLI lays down for authentication) - `az login`, `aws configure`, `gcloud auth application-default login`

Select Environment: 

- `export CF_ENV_CLOUD=azure` (azure, aws, gcp)
    - Note: If deploying into GCP the following environment variable needs to also be set - `export GOOGLE_PROJECT_ID=my_project_id`

Create:

- `npm run deployment-create`

Delete:

- `npm run deployment-delete`

Note: Running terraform commands may require sudo in certain environments, set the following environment variable if necessary - `export USE_SUDO=true`

## Misc Notes

- Deploy source code on to the environment BIG-IP(s) using scp: `bash scripts/deploy_source.sh`