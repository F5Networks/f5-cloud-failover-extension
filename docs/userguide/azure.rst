.. _azure:

Azure
=====


Failover Event Diagram
----------------------

This diagram shows a failover event with Cloud Failover implemented in Microsoft Azure. IP configuration(s) with a secondary private address that matches a virtual address in a traffic group owned by the active BIG-IP are deleted and recreated on that device's network interface(s). User-defined routes with a destination and parent route table with tags matching the Failover Extension configuration are updated with a next hop attribute that corresponds to the self-IP address of the active BIG-IP.

.. image:: ../images/AzureFailoverExtensionHighLevel.gif
  :width: 800

Prerequisites
-------------
These are the minimum requirements for setting up Cloud Failover in Microsoft Azure:

- 2 clustered BIG-IPs
   - Note: Here is an |armtemplate|, although it is not required. Any configuration tool can be used to provision the resources.
- An Azure |managed-identity| with sufficient access. This should be limited to the appropriate resource groups where it contains the BIG-IP VNet and route tables.
    - User Access Administrator
    - Contributor access 
- Storage account for Cloud Failover extension cluster-wide file(s)
    - Tagged with a key/value corresponding to the key/value(s) provided in the `externalStorage.scopingTags` section of the Cloud Failover extension configuration
    - Note: Ensure that the required storage accounts have no public access
- Network Interfaces should be tagged with a key/value corresponding to the key/value(s) provided in the `failoverAddresses.scopingTags` section of the Cloud Failover extension configuration
- Virtual addresses created in a traffic group (floating) and matching addresses (secondary) on the IP configurations of the instance NICs serving application traffic
- Route(s) in a route table tagged with the following (optional):
    - Tagged with a key/value corresponding to the key/value(s) provided in the `failoverRoutes.scopingTags` section of the Cloud Failover extension configuration
    - Tagged with a special key call ``f5_self_ips`` containing a comma separated list of addresses mapping to a self IP address on each instance in the cluster that the routes should be pointed. Example: `10.0.0.10,10.0.0.11`
    - Note: The failover extension configuration `failoverRoutes.scopingAddressRanges` should contain a list of destination routes to update


Azure's Instance Metadata Service is a REST Endpoint accessible to all IaaS VMs created with the Azure Resource Manager. The endpoint is available at a well-known non-routable IP address (169.254.169.254) that can be accessed only from within the VM. This endpoint should be reach out from BIG-IP system’s management interface:

.. code-block:: json

  "managementRoute": {
            "class": "ManagementRoute",
            "gw": "1.2.3.4",
            "network": "169.254.169.254",
            "mtu": 1500
        },
        "dbVars": {
            "class": "DbVariables",
            "config.allow.rfc3927": "enable"
        }




.. _azure-example:

Example Declaration
-------------------
This example declaration shows the minimum information needed to update the cloud resources in Azure.

.. code-block:: json


    {
        "class": "Cloud_Failover",
        "environment": "azure",
        "externalStorage": {
            "scopingTags": {
              "f5_cloud_failover_label": "mydeployment"
            }
        },
        "failoverAddresses": {
            "scopingTags": {
              "f5_cloud_failover_label": "mydeployment"
            }
        },
        "failoverRoutes": {
          "scopingTags": {
            "f5_cloud_failover_label": "mydeployment"
          },
          "scopingAddressRanges": [
            "192.168.1.0/24"
          ]
        }
    }


.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/tree/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">Github</a>

.. |armtemplate| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/blob/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">example ARM template</a>


.. |managed-identity| raw:: html

   <a href="https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/overview" target="_blank">system-assigned or user-managed identity</a>