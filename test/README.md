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

All functional tests reside inside the ```functional``` folder and are run using ```npm run test-functional``` from the repository root.  Terraform 0.12+, A Python 3.7+ virtual environment, and the f5-cloud-cli are required.

Best Practices:

- Clean up after yourself - although it is a fairly safe assumption to make that this is a fresh environment consider if it were multi-use when writing tests
- Consider carefully before testing things in functional test that should or could be tested via unit test - those are run more frequently

### Environment

It is somewhat implied that running the functional tests requires a runtime (BIG-IP, container, etc.) to deploy the iLX extension, consumers, etc.  The current methodology is to deploy and subsequently teardown the runtime every time functional tests are run, with the understanding that functional tests will be run less frequently than unit tests.

The deploy/teardown environment steps are handled using an internal tool (cicd-bigip-deploy) initially created for an unrelated project by one of the developers of this project, see the **deploy_env** job in the ```.gitlab-ci.yml``` file for additional comments.  Essentially the flow looks like the following in the pipeline:

1. Pipeline triggered - with `REQ_DEVICE_PIPELINE` and `RUN_FUNCTIONAL_TESTS` set to true
2. **deploy_env/teardown_env** steps will run, ***only*** if the variable `REQ_DEVICE_PIPELINE` is set to true
3. The **functional test** step will run, ***only*** if the variable `RUN_FUNCTIONAL_TESTS` is set to true

Internal tool notes:

- It is packaged as a container made available via an internal docker repository, a project variable contains the url for the container.
- It uses VIO as the runtime for instance creation/deletion, project variables contain the name of the VIO project, VIO credentials, etc.