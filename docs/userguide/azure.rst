.. _azure:

Azure
=====

In this section, you will see the complete steps for implementing Cloud Failover Extension in Microsoft Azure. You can also go straight to the :ref:`azure-example`.

.. _azure-prereqs:

Azure CFE Prerequisites
-----------------------
These are the basic prerequisites for setting up CFE in Microsoft Azure.

- **2 BIG-IP systems in Active/Standby configuration**. You can find an `example ARM template here <https://github.com/F5Networks/f5-azure-arm-templates-v2/tree/main/examples/failover>`_ . Any configuration tool can be used to provision the resources.
- **Virtual addresses** created in a floating traffic group and matching addresses (secondary) on the IP configurations of the instance NICs serving application traffic.

  .. TIP:: Use Static allocation for each IP configuration that will serve application traffic. Using Dynamic allocation is discouraged for production deployments.

- **Access to Azure's Instance Metadata Service**, which is a REST Endpoint accessible to all IaaS VMs created with the Azure Resource Manager. The endpoint is available at a well-known non-routable IP address (169.254.169.254) that can only be accessed from within the VM. See the instructions below to :ref:`azure-ims`.
- **Enable "enableIPForwarding"** on the NICs if enabling routing or avoiding SNAT. See `Enable or disable IP forwarding <https://docs.microsoft.com/en-us/azure/virtual-network/virtual-network-network-interface#enable-or-disable-ip-forwarding>`_ for more information.


.. NOTE:: CFE makes calls to the Azure APIs in order to failover cloud resource objects such as private IP addresses and route tables. These calls may vary significantly in response time. See the :ref:`performance-sizing` section for example times.

|

Complete these tasks to deploy Cloud Failover Extension in Microsoft Azure. Before getting started, we recommend you review the `Known Issues <https://github.com/F5Networks/f5-cloud-failover-extension/issues>`_ and :ref:`faq`. To see how to run CFE on Azure when BIG-IP instances have no route to public internet, see :ref:`isolated-env`. 

.. include:: /_static/reuse/initial-config.rst

.. table:: Task Summary

   =======  ===================================================================
   Step     Task
   =======  ===================================================================
   1.       :ref:`download-rpm`

            - :ref:`verify-rpm`

   2.       :ref:`upload-install`

            - :ref:`installgui-ref` (or)
            - :ref:`installcurl-ref`

   3.       :ref:`azure-msi`
   4.       :ref:`azure-define-objects`

            - :ref:`azure-define-storage`
            - :ref:`azure-define-addresses`
            - :ref:`azure-define-routes`

   5.       :ref:`azure-ims`
   6.       Modify and POST the :ref:`azure-example`
   7.       :ref:`update-revert`
   =======  ===================================================================





.. _azure-diagram:

Azure Failover Event Diagram
----------------------------

The following diagram shows a failover event with CFE implemented in Microsoft Azure with an HA pair in an Active/Standby configuration.

In the diagram, the IP configuration has a secondary private address that matches a virtual address in a traffic group owned by the active BIG-IP. In the event of a failover, the IP configuration is deleted and recreated on that device's network interface. Simultaneously, the user-defined routes are updated with a next hop attribute the corresponds to the self IP address of the active BIG-IP.


.. image:: ../images/azure/azure-failover-3nic-multiple-vs-animated.gif

|

.. Note:: Management NICs/Subnets are not shown in this diagram.

.. _azure-example:

Example Azure Declaration
-------------------------
This example declaration shows the minimum information needed to update the cloud resources in Azure. See the :ref:`quickstart` section for steps on how to post this declaration. See the :ref:`example-declarations` section for more examples.


.. literalinclude:: ../../examples/declarations/azure-1.7.0.json
   :language: json
   :caption: Example Azure Declaration with Single Routing Table
   :tab-width: 4
   :linenos:

:fonticon:`fa fa-download` :download:`azure.json <../../examples/declarations/azure-1.7.0.json>`

|


.. _azure-msi:

Create and assign a Managed Service Identity (MSI)
--------------------------------------------------
In order to successfully implement CFE in Azure, you need a system-assigned or user-managed identity with sufficient access. Your Managed Service Identity (MSI) should be limited to the resource groups that contain the BIG-IP instances, VNET, route tables, etc. that will be updated. Read more about managed identities |managed-identity|.
To create and assign a Managed Service Identity (MSI) you must have a role of `User Access Administrator` or `Contributor access`. The following example shows a system-assigned MSI.

.. IMPORTANT:: CFE supports only **one** Managed Service Identity assigned to each Azure Virtual Machine instance; failover will NOT work correctly when multiple identities are assigned. You must create a single identity with all of the permissions required by CFE, as well as any other necessary permissions. 
   You can create a managed identity manually or using the F5 access template. See `Deploying Access Template <https://github.com/F5Networks/f5-azure-arm-templates-v2/tree/main/examples/modules/access>`_ for more information.

#. Enable MSI for each VM: go to **Virtual Machine > Identity > System assigned** and set the status to ``On``.

   For example:

   .. image:: ../images/azure/AzureMSIVMIdentity.png


   | 

#. Assign permissions to each MSI: go to **Resource Group > Access control (IAM) > Role assignments > Add**, make the changes listed below, and then add the MSI.

   - Role: Contributor
   - Assign access to: **System assigned managed identity > Virtual Machine**

   |

   For example: 

   .. image:: ../images/azure/AzureMSIAssignedToResourceGroup.png


.. NOTE:: Certain resources may be deployed in a separate subscription. Add role assignments for each subscription where resources are located.


.. _azure-rbac:

RBAC Role Definition
````````````````````

Below is an example Azure role definition with permissions required by CFE.

======================================================================  ==================================== ======================= ======================================================================================== 
 Name                                                                   Scope                                CFE Component           Description   
======================================================================  ==================================== ======================= ======================================================================================== 
 Microsoft.Authorization/\*/read                                        Roles and Role Assignments - Read    All                     To authenticate using the managed identity.        
 Microsoft.Compute/locations/\*/read                                    Locations - Read                     All                     To get the Azure location.
 Microsoft.Compute/virtualMachines/\*/read                              Virtual Machines - Read              All                     To get information about a BIG-IP instance.   
 Microsoft.Network/\*/join/action                                       Network Provider - Join              All                     To update network. 
 Microsoft.Network/networkInterfaces/read                               Network Interfaces - Read            All                     To get information about a network interface.
 Microsoft.Network/networkInterfaces/write                              Network Interfaces - Write           All                     To update a network interface to use the active BIG-IP instance.
 Microsoft.Network/publicIPAddresses/read                               Public IP Addresses - Read           failoverAddresses       To get information about a public IP address.
 Microsoft.Network/publicIPAddresses/write                              Public IP Addresses - Write          failoverAddresses       To update a public IP address to use the active BIG-IP instance.
 Microsoft.Network/routeTables/\*/read                                  Route Tables - Read                  failoverRoutes          To get information about a route table.
 Microsoft.Network/routeTables/\*/write                                 Route Tables - Write                 failoverRoutes          To update route next hop to use the active BIG-IP instance.
 Microsoft.Resources/subscriptions/resourceGroups/read                  Resource Groups - Read               All                     To get information about a resource group.
 Microsoft.Storage/storageAccounts/read                                 Storage Accounts - Read              externalStorage         To get information about the storage account used for the failover state file.
 Microsoft.Storage/storageAccounts/blobServices/containers/read         Storage Containers - Read            externalStorage         To get information about the storage container used for the failover state file.
 Microsoft.Storage/storageAccounts/blobServices/containers/write        Storage Containers - Write           externalStorage         To create the storage container used for the failover state file.
 Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read   Storage Blobs - Read                 externalStorage         To get information about the storage blob used for the failover state file.
 Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write  Storage Blobs - Write                externalStorage         To create the storage blob used for the failover state file.
======================================================================  ==================================== ======================= ======================================================================================== 

   |


.. IMPORTANT::

   - This example provides the minimum permissions required and serves as an illustration. You are responsible for following the provider's IAM best practices.
   - Certain resources such as the virtual network are commonly deployed in a separate resource group; ensure the correct scopes are applied to all applicable resource groups.
   - Certain resources such as route tables may be deployed in a separate subscription, ensure the assignable scopes applies to all relevant subscriptions.
   - CFE supports only **one** Managed Service Identity assigned to each Azure Virtual Machine instance; failover will not function when multiple identities are assigned. You must create a single identity with all of the permissions listed above, as well as any other required permissions. You can create a managed identity manually, or by using the F5 access template. See `Deploying Access Template <https://github.com/F5Networks/f5-azure-arm-templates-v2/tree/main/examples/modules/access>`_ for more information.
   - Previous versions of CFE required the **Microsoft.Storage/storageAccounts/listKeys/action** role definition permission; this requirement has been superseded by the **Microsoft.Storage/storageAccounts/blobServices/containers/** data actions permissions listed above.

|


.. _azure-define-objects:

Define your Azure Infrastructure Objects
----------------------------------------

Define or Tag your cloud resources with the keys and values that you configure in your CFE declaration.

.. _azure-define-storage:

Define the Storage Account in Azure
```````````````````````````````````

Add a storage account in Azure to your resource group for Cloud Failover to use. 

1. Create a `Storage Account in Azure <https://docs.microsoft.com/en-us/azure/storage/common/storage-account-create?tabs=azure-portal>`_ for Cloud Failover Extension cluster-wide file(s).

   .. WARNING:: Ensure the required storage accounts do not have public access. See your cloud provider for Best Practices.

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``scopingName`` is available in Cloud Failover Extension v1.7.0 and later.

2. Update/modify the Cloud Failover ``scopingName`` value with name of your Storage Account:

   .. code-block:: json

      "externalStorage":{
        "scopingName": "yourStorageAccountforCloudFailover"
      },

   |


   Alternatively, if you are using the Discovery via Tag option, tag the Azure Storage Account with your custom key:values in the `externalStorage.scopingTags` section of the CFE declaration.

   .. code-block:: json

      "externalStorage":{
         "scopingTags":{
            "f5_cloud_failover_label":"mydeployment"
         }
      },


   .. NOTE:: If you use our declaration example, the key-value tag would be: ``"f5_cloud_failover_label":"mydeployment"``

   .. image:: ../images/azure/AzureStorageTags.png

|

.. _azure-tag-nics:

Tag the Network Interfaces in Azure
```````````````````````````````````

.. IMPORTANT:: Tagging the NICs is required for all deployments regardless of which configuration option (`Explicit` or `Discovery via Tag`) you choose to define your failover objects.


1. Within Azure, go to **NIC > Tags**. 

2. Create two sets of tags for Network Interfaces:

   - **Deployment scoping tag**: a key-value pair that will correspond to the key-value pair in the `failoverAddresses.scopingTags` section of the CFE declaration.

     .. NOTE:: If you use our declaration example, the key-value tag would be: ``"f5_cloud_failover_label":"mydeployment"``
   
   - **NIC mapping tag**: a key-value pair with the reserved key named ``f5_cloud_failover_nic_map`` and a user-provided value that can be anything. For example ``"f5_cloud_failover_nic_map":"external"``. Only required when using the the `Discovery via Tag` configuration option. 

     .. IMPORTANT:: The same tag (matching key:value) must be placed on corresponding NIC on the peer BIG-IP. For example, each BIG-IP would have their external NIC tagged with ``"f5_cloud_failover_nic_map":"external"`` and their internal NIC tagged with ``"f5_cloud_failover_nic_map":"internal"``.

   For Example:


   .. image:: ../images/azure/AzureNICTags.png

|

.. _azure-define-addresses:

Define the Failover Addresses in Azure
``````````````````````````````````````

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``addressGroupDefinitions`` is available in Cloud Failover Extension v1.7.0 and later.

Update/modify the ``addressGroupDefiniitions`` list to match the addresses in your deployment. In the example below, there are two services defined on secondary IP adddress:

- Virtual Service 1 (10.0.12.101): Mapped to an Azure secondary IP (10.0.12.101)
- Virtual Service 2 (10.0.12.102): Mapped to an Azure secondary IP (10.0.12.102)

.. code-block:: json

   "failoverAddresses":{
      "enabled":true,
      "scopingTags": {
         "f5_cloud_failover_label": "mydeployment"
      },
       "addressGroupDefinitions": [
         {
           "type": "networkInterfaceAddress",
           "scopingAddress": "10.0.12.101"
         },
         {
           "type": "networkInterfaceAddress",
           "scopingAddress": "10.0.12.102"
         }
       ]
   },

|

Alternatively, if you are using the Discovery via Tag option, edit the declaration as shown below. This will look for BIG-IPs Virtual Addresses (on traffic-group 1) and try to match them to Secondary IPs.

.. code-block:: json

  "failoverAddresses": {
     "enabled": true,
     "scopingTags": {
        "f5_cloud_failover_label": "mydeployment"
     }
  },

|

|

.. _azure-define-routes:

Define the Routes in Azure
``````````````````````````
.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

  - The property ``routeGroupDefinitions`` is available in Cloud Failover Extension v1.5.0 and later.
  - Beginning in version v1.15.0, CFE will be compatible with routes that use Azure Service Tag address prefixes. Previously Service Tags would cause CFE to fail to discover routes.

Update/modify the ``routeGroupDefinitions`` list to the desired route tables and prefixes to manage. The ``routeGroupDefinitions`` property allows more granular route-table operations. See :ref:`failover-routes` for more information. 

.. code-block:: json

   "failoverRoutes":{
       "enabled":true,
       "routeGroupDefinitions":[
           {
             "scopingName":"route-table-1",
             "scopingAddressRanges":[
                 {
                   "range":"0.0.0.0/0"
                 }
             ],
             "defaultNextHopAddresses":{
                 "discoveryType":"static",
                 "items":[
                   "10.0.13.11",
                   "10.0.23.11"
                 ]
             }
           }
       ]
   }

|

- See :ref:`azure_multiple_subscriptions` for examples of managing route tables in multiple subscriptions.
- See :ref:`advanced-routing-examples-azure` for additional examples of more advanced configurations.

|

Alternatively, if you are using the Discovery via Tag option, tag your route tables containing the routes you want to manage.

1. Create a key-value pair that will correspond to the key-value pair in the `failoverAddresses.scopingTags` section of the CFE declaration.

   .. NOTE:: If you use our declaration example, the key-value tag would be ``"f5_cloud_failover_label":"mydeployment"``


|

In the case where BIG-IP has multiple NICs, CFE needs to know which interfaces (by using the Self-IPs associated with those NICs) it needs to re-map the routes to. You can either define the nextHopAddresses statically in the CFE configuration or if using the Discovery via Tag configuration using an additional tag on the route table.

   - If you use discoveryType ``static``, you can provide the Self-IPs in the items area of the CFE configuration. See :ref:`failover-routes` for more information.
  
   - If you use discoveryType ``routeTag``, you will need to add another tag to the route table in your cloud environment with the reserved key ``f5_self_ips``. For example, ``"f5_self_ips":"10.0.13.11,10.0.23.11"``.
   
   |

   .. code-block:: json

       "failoverRoutes": {
         "enabled": true,
         "scopingTags": {
           "f5_cloud_failover_label": "mydeployment"
         },
         "scopingAddressRanges": [
           {
             "range": "0.0.0.0/0",
             "nextHopAddresses": {
                 "discoveryType":"routeTag"
             }
           }
         ]
       }



   |


1. Within Azure, go to **Basic UDR > Tags** to create a deployment scoping tag. The name and value can be anything; the example below uses ``f5_cloud_failover_label:mydeployment``.


   .. image:: ../images/azure/AzureUDR.png


|

|

.. _azure-ims:

Set up access to Azure's Instance Metadata Service
--------------------------------------------------

Azure's Instance Metadata Service is a REST Endpoint accessible to all IaaS VMs created via the Azure Resource Manager. The endpoint is available at a well-known non-routable IP address (169.254.169.254) that can be accessed only from within the VM.

.. IMPORTANT:: Certain BIG-IP versions and/or topologies may use DHCP to create the management routes (for example: ``dhclient_route1``), if that is the case the below steps are not required.

To configure the route on BIG-IP to talk to Azure's Instance Metadata Services, use either of the commands below. Note that in this example, 192.0.2.1 is the management subnet's default gateway.

Using TMSH
``````````

.. code-block:: bash

  tmsh modify sys db config.allow.rfc3927 value enable
  tmsh create sys management-route metadata-route network 169.254.169.254/32 gateway 192.0.2.1
  tmsh save sys config

Using Declarative Onboarding
````````````````````````````
        
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

|


.. _azure-as3-example:

Example Virtual Service Declaration
-----------------------------------

See below for example Virtual Services created with `AS3 <https://clouddocs.f5.com/products/extensions/f5-appsvcs-extension/latest/>`_ in :ref:`azure-diagram` above:

.. literalinclude:: ../../examples/toolchain/as3/azure-as3.json
   :language: json
   :caption: Example AS3 Declaration
   :tab-width: 4
   :linenos:

:fonticon:`fa fa-download` :download:`azure-as3.json <../../examples/toolchain/as3/azure-as3.json>`


Azure Private Endpoints
-----------------------

To see how to run CFE on Azure when BIG-IP instances have no route to public internet, see :ref:`isolated-env`. 

.. NOTE:: Microsoft has an early access program for their new control plane, which enables CFE to failover in seconds. 
   To gain early access, contact your F5 Account Manager or Sales Engineer. See :ref:`performance-sizing` for more information.


.. include:: /_static/reuse/feedback.rst


.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/tree/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">Github</a>


.. |armtemplate| raw:: html

   <a href="https://github.com/F5Networks/f5-azure-arm-templates/tree/master/supported/failover/same-net/via-api/n-nic/existing-stack/payg" target="_blank">here</a>


.. |managed-identity| raw:: html

   <a href="https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/overview" target="_blank">here</a>