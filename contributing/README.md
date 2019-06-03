# Introduction

This is the top-level documentation which provides notes and information about contributing to this project.  It is broken down into a couple of key sections, listed below.

- [Overview](#overview)
- [Contributing](#contributing)

---
## Overview

The F5 failover extension includes a number of key components, listed below.

*Initialization*: Prepares the environment for failover.  Writes user data to cloud provider storage and configures the /config/failover scripts on BIG-IP.

*Failover*: Triggers a failover event.  Reads configuration from BIG-IP and the cloud provider storage, creates a desired configuration, and updates cloud resources.

---
### Diagram

![diagram](images/FailoverExtensionSequence.png)

---
### Anatomy of an Initialization Request

How does the project handle a `POST` request in the initialization stage?

`POST /mgmt/shared/cloud-failover/declare`

```json
{
	"class": "CloudFailover",
	"MyInit": {
	    "class": "Initialize",
	    "environment": "azure",
	    "useMetadata": true,
	    "storageResource": "myuniquestorageaccount",
	    "storageTags": [
	        {
	            "key": "value",
	            "value": "myvalue"
	        }
	    ],
	    "managedRoutes": [
	        "192.168.1.0/24",
	        "0.0.0.0/0"
	    ],
	    "addressTags": [
	        {
	            "key": "value",
	            "value": "myvalue"
	        }
        ]
    }
}
```

*Response*:

```javascript
{
    "message": "success",
    "declaration": {
        "class": "CloudFailover",
        "MyInit": {
            "class": "Initialize",
            "environment": "azure",
            "useMetadata": true,
            "storageResource": "myuniquestorageaccount",
            "storageTags": [
                {
                    "key": "value",
                    "value": "myvalue"
                }
            ],
            "managedRoutes": [
                "192.168.1.0/24",
                "0.0.0.0/0"
            ],
            "addressTags": [
                {
                    "key": "value",
                    "value": "myvalue"
                }
            ]
        }
    }
}
```

---
#### Anatomy of an Initialization Request (cont.)

What happens in the system internals between request and response?

- LX worker receives request which validates URI, etc.
    - ref: [restWorkers/main.js](../src/nodejs/restWorkers/main.js)
- Request is validated using JSON schema and AJV
    - ref: [validator.js](../src/nodejs/validator.js)
- A provider auth token is acquired
    - ref: [auth.js](../src/nodejs/providers/auth.js)
- User data is written to cloud provider storage
    - ref: [storage.js](../src/nodejs/providers/storage.js)
- Failover declaration/API call is written to /config/failover scripts on BIG-IP
    - ref: [device.js](../src/nodejs/providers/device.js)
- Client response sent with validated config
    - ref: [config.js](../src/nodejs/response.js)
    ```javascript
        return promise.then((config) => {
        util.restOperationResponder(restOperation, 200,
            { message: 'success', declaration: config });
    })
    ```
    
---
### Anatomy of a Failover Request

How does the project handle a `POST` request in the failover stage?

`POST /mgmt/shared/cloud-failover/declare`

```json
{
    "class": "CloudFailover",
	"MyFailover": {
	    "class": "Failover",
	    "environment": "azure"
	}
}
```

*Response*:

```javascript
{
    "message": "success",
    "declaration": {
        "class": "CloudFailover",
        "MyFailover": {
            "class": "Failover",
            "environment": "azure"
        }
    }
}
```

---
#### Anatomy of a Failover Request (cont.)

What happens in the system internals between request and response?

- LX worker receives request which validates URI, etc.
    - ref: [restWorkers/main.js](../src/nodejs/restWorkers/main.js)
- Request is validated using JSON schema and AJV
    - ref: [validator.js](../src/nodejs/validator.js)
- A provider auth token is acquired
    - ref: [auth.js](../src/nodejs/providers/auth.js)
- User data is read from cloud provider storage
    - ref: [storage.js](../src/nodejs/providers/storage.js)
- BIG-IP configuration is read from local device
    - ref: [device.js](../src/nodejs/providers/device.js)
- Before/after configuration, timestamp are created and written to provider storage
    - ref: [failover.js](../src/nodejs/providers/failover.js), [storage.js](../src/nodejs/providers/storage.js)
- Provider resources are updated to match "after" configuration
    - ref: [failover.js](../src/nodejs/providers/failover.js)
- Completed task info is written from cloud provider storage
    - ref: [storage.js](../src/nodejs/providers/storage.js)
- Client response sent with failover result
    - ref: [config.js](../src/nodejs/response.js)
    ```javascript
        return promise.then((config) => {
        util.restOperationResponder(restOperation, 200,
            { message: 'success', declaration: config });
    })
    ```

---
## Contributing

Ok, overview done!  Now let's dive into the major areas to be aware of as a developer.

- [Core Modules](#core-modules)
- [Testing methodology](#testing-methodology)
- [Release methodology](#release-methodology)
- [Public documentation methodology](#public-documentation-methodology)

---
### Core modules

All core modules are included inside `../src/nodejs/`

- [restWorkers/main.js](../src/nodejs/restWorkers/main.js)
    - Purpose: Hook for incoming HTTP requests

- [auth.js](../src/nodejs/providers/auth.js)
    - Purpose: When passed an environment name, gets an authentication token from local metadata and returns a provider management client object for use in making calls to provider APIs
- [device.js](../src/nodejs/providers/device.js)
    - Purpose: When passed a iControl REST resource URI, returns the desired configuration from the local BIG-IP device (using f5-cloud-libs bigIp class)
- [failover.js](../src/nodejs/providers/failover.js)
    - Purpose: Gets and munges the user data, provider configuration, and local BIG-IP configuration and returns the 'before failover' and 'after failover' configurations
- [storage.js](../src/nodejs/providers/storage.js)
    - Purpose: Creates storage client, reads/writes user data and failover state to provider storage location

- [logger.js](../src/nodejs/logger.js)
    - Purpose: Log events to /var/log/restnoded/restnoded.log
- [validator.js](../src/nodejs/validator.js)
    - Purpose: Validate POST data against schema(s) using ajv
- [state.js](../src/nodejs/state.js)
    - Purpose: Create, update, and return configuration state
- [response.js](../src/nodejs/response.js)
    - Purpose: Send REST response to client
- [constants.js](../src/nodejs/constants.js)
    - Purpose: Define shared variables

---
### Testing methodology

Additional information about the testing methodology can be found in the [test readme](../test/README.md)

---
### Release methodology

Build/publish makes heavy use of GitLab and [.gitlab-ci.yml](../.gitlab-ci.yml).  Check out CI file and GitLab documentation for more details.

- Add *new* RPM to `dist/` directory (from build artifact on mainline developement branch)
- Publish to artifactory (automated on new tags)
- Push to GitLab (mainline release branch)
- Push to GitHub (mainline release branch)

*Local development build process*: Various strategies exist here, see the following for an inexhaustive list.

- Build locally using `build_rpm.sh` or similar, copy RPM to BIG-IP
- VS Code `tasks.json` to copy `src/` files to BIG-IP and run `restart restnoded`
- Matthe Zinke's ICRDK [development kit](https://github.com/f5devcentral/f5-icontrollx-dev-kit/blob/master/README.md)
- Vim on BIG-IP (enough said, you know who you are)

Note: See Release Checklist on Confluence for complete details.

---
### Public documentation methodology

In general, see the documentation team for more details... however there is a process.

The current process involves adding a `doc` label to an issue to note it requires public documentation.  This will cause the issue to show up in a documentation board in GitLab, the developer responsible for the feature is also responsible for generating the artifacts required by the documentation team member.

See the [examples](../examples/declarations) directory for curated artifacts such as declaration examples, output examples, AS3 declaration example, etc.

See the [INTERNAL_README.md](../INTERNAL_README.md) for an internal explanation of most features.
