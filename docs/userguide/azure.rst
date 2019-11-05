.. _azure:

Azure
=====


Failover Event Diagram
----------------------

This diagram shows a failover event with Cloud Failover implemented in Microsoft Azure. IP configuration(s) with a secondary private address that matches a virtual address in a traffic group owned by the active BIG-IP are deleted and recreated on that device's network interface(s). User-defined routes with a destination and parent route table with tags matching the Failover Extension configuration are updated with a next hop attribute that corresponds to the self-IP address of the active BIG-IP.

.. image:: ../images/azure/AzureFailoverExtensionHighLevel.gif
  :width: 800

Prerequisites
-------------
These are the minimum requirements for setting up Cloud Failover in Microsoft Azure:

- 2 BIG-IPs in Active/Standby configuration. You can find an example ARM template |armtemplate|. Any configuration tool can be used to provision the resources.
- An Azure |managed-identity| with sufficient access. This should be limited to the appropriate resource groups that contain the BIG-IP VNet as well as any route tables that will be updated.
  - .. IMPORTANT:: To create and assign a Managed Service Identity (MSI) the following roles are required.
    - User Access Administrator
    - Contributor access 
  - You will also need to have a created and assigned MSI (using system assigned in this example)
    - To enable MSI for each VM, go to *Virtual Machine -> Identity -> System assigned* and set the status to *On*
    .. image:: ../images/azure/AzureMSIVMIdentity.png
        :width: 800
    - To assign permissions to each MSI, go to *Resource Group -> Access control (IAM) -> Role assignments -> Add*, make the changes listed below, and then add the MSI.
      - Role: Contributor
      - Assign access to: System assigned managed identity -> Virtual Machine
      .. image:: ../images/azure/AzureMSIAssignedToResourceGroup.png
        :width: 800
- A storage account for Cloud Failover extension cluster-wide file(s) that is tagged with a key/value pair corresponding to the key/value(s) provided in the `externalStorage.scopingTags` section of the Cloud Failover extension configuration.
    .. IMPORTANT:: Ensure the required storage accounts do not have public access.
- Network Interfaces that are tagged with a key/value corresponding to the key/value(s) provided in the `failoverAddresses.scopingTags` section of the Cloud Failover extension configuration. The network interfaces should have ``f5_cloud_failover_nic_map`` tagged with a specific value. For example, network interface 1 (nic01) and network interface 2 (nic-02) should be tagged with ``f5_cloud_failover_nic_map: external`` to indicate association between the nics.
- Virtual addresses created in a traffic group (floating) and matching addresses (secondary) on the IP configurations of the instance NICs serving application traffic
- Route(s) in a route table tagged with the following (optional):
    - Tagged with a key/value corresponding to the key/value(s) provided in the `failoverRoutes.scopingTags` section of the Cloud Failover extension configuration
    - Tagged with a special key call ``f5_self_ips`` containing a comma separated list of addresses mapping to a self IP address on each instance in the cluster that the routes should be pointed. Example: `10.0.0.10,10.0.0.11`
    - Note: The failover extension configuration `failoverRoutes.scopingAddressRanges` should contain a list of destination routes to update
- Access to Azure's Instance Metadata Service, which is a REST Endpoint accessible to all IaaS VMs created within Azure. The endpoint is available at a well-known non-routable IP address (169.254.169.254) that can only be accessed from within the VM.
    - .. IMPORTANT:: Certain BIG-IP versions and/or topologies may use DHCP to create the management routes (example: dhclient_route1), if that is the case the below steps are not required.
    - Configuration Examples
      - Using TMSH

        .. code-block:: bash

          tmsh modify sys db config.allow.rfc3927 value enable
          tmsh create sys management-route metadata-route network 169.254.169.254/32 gateway 192.0.2.1
          tmsh save sys config

      - Using Declarative Onboarding
        
        .. code-block:: json

          {
            "managementRoute": {
              "class": "ManagementRoute",
              "gw": "192.0.2.1",
              "network": "169.254.169.254",
              "mtu": 1500
            },
            "dbVars": {
              "class": "DbVariables",
              "config.allow.rfc3927": "enable"
            }
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

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/blob/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">here</a>


.. |managed-identity| raw:: html

   <a href="https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/overview" target="_blank">system-assigned or user-managed identity</a>