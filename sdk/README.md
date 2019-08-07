# Usage

## Generate SDK

```bash
openapi-generator generate -i specs/openapi.yaml -g python -o sdk/dist/python
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