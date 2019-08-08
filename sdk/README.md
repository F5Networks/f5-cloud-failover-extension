# Usage

## Generate SDK

Python:
```bash
openapi-generator generate -i specs/openapi.yaml -g python -o sdk/dist/python
```
JavaScript:
```bash
openapi-generator generate -i specs/openapi.yaml -g javascript -o sdk/dist/js
```
## Configure SDK

JavaScript

Set Environment Variable: ```NODE_TLS_REJECT_UNAUTHORIZED=0```
```bash
npm install
npm link
npm link cloud_failover__cf_extension
npm run build
```
## Use SDK

```python
from __future__ import print_function
import time
import openapi_client
from openapi_client.rest import ApiException
from pprint import pprint
from openapi_client.configuration import Configuration

configuration = Configuration()
configuration.verify_ssl = False
configuration.host = "https://192.0.2.1:443/mgmt/shared/cloud-failover"
configuration.username = 'admin'
configuration.password = 'admin'

# Create an instance of the API class
api_instance = openapi_client.ConfigurationApi(openapi_client.ApiClient(configuration))
try:
    # List configuration
    api_response = api_instance.declare_get()
    pprint(api_response)
except ApiException as e:
    print("Exception when calling ConfigurationApi->declare_get: %s\n" % e)
```
```javascript
var CloudFailoverCfExtension = require('cloud_failover__cf_extension');

var defaultClient = CloudFailoverCfExtension.ApiClient.instance;
// Configure HTTP basic authorization: BasicAuth
var BasicAuth = defaultClient.authentications['BasicAuth'];
BasicAuth.username = 'YOUR USERNAME'
BasicAuth.password = 'YOUR PASSWORD'
defaultClient.basePath = 'LINK-TO-BIG-IP-HOST'

var api = new CloudFailoverCfExtension.ConfigurationApi()
var callback = function(error, data, response) {
    if (error) {
        console.error(error);
    } else {
        console.log('API called successfully. Returned data: ' + JSON.stringify(data));
    }
};
api.declareGet(callback);

```
