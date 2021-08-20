.. _configure:

Configure Cloud Failover Extension
==================================

Once the Package is installed, you will use the REST endpoints to configure the Cloud Failover Extension.

1. Using a RESTful API client, send a GET request to the URI ``https://{{host}}/mgmt/shared/cloud-failover/info`` to ensure Cloud Failover Extension is installed and running.
   
   For illustration purposes, the examples below use `curl` on the BIG-IP itself and the utililty `jq` to pretty print the JSON output:

   .. code-block:: shell

      [admin@bigip-A:Active:In Sync] config # curl -su admin: -X GET http://localhost:8100/mgmt/shared/cloud-failover/info | jq .
      {
         "version": "1.2.3",
         "release": "0",
         "schemaCurrent": "1.2.3",
         "schemaMinimum": "1.2.3"
      }



2. Copy one of the example declarations from the individual cloud provider sections or one of the :ref:`example-declarations` which best matches the desired configuration. See each provider section for additional details and requirements.

   - :ref:`aws`
   - :ref:`gcp`
   - :ref:`azure`


3. Paste or copy the declaration into your API client, and modify any names, addresses, routes, or properties as applicable. If the configuration requires tags, the key and value pair in the configuration can be arbitrary but they must match the tags or labels that you assign to the infrastructure within the cloud provider. You can craft your declaration with any key and value pair as long as it matches what is in the configuration. For example:

   .. code-block:: json

      "failoverAddresses": {
         "scopingTags": {
            "i_am_an_arbitrary_key": "i_am_an_arbitrary_value"
         }


4. POST to the URI ``https://<BIG-IP>/mgmt/shared/cloud-failover/declare``. 

   Below is an example where `cfe.json` is the name of the file that has been uploaded or edited locally to contain the contents of your CFE declaration. 

   .. code-block:: shell

      [admin@bigip-A:Active:In Sync] config # vim cfe.json 
      [admin@bigip-A:Active:In Sync] config # curl -su admin: -X POST -d @cfe.json http://localhost:8100/mgmt/shared/cloud-failover/declare | jq .
      [admin@bigip-B:Standby:In Sync] config # curl -su admin: -X POST -d @cfe.json http://localhost:8100/mgmt/shared/cloud-failover/declare | jq .

   |

   You should receive an expected response of `success` after you have posted this declaration. For example:

   .. code-block:: json

        {
            "message": "success",
                "declaration": {
                    "class": "Cloud_Failover",
                    ... rest of your declaration ...



   .. IMPORTANT::

      You must POST the initial configuration to each device at least once for the appropriate system hook configuration to enable failover via CFE. After that, additional configuration operations can be sent to a single device.

      
5. Validate.
   
   - See the :ref:`config-validation` section below. 
   - Review the logs: ``tail –f /var/log/restnoded/restnoded.log``.


|

.. _config-validation:

Validation
----------

On any initial configuration or re-configuration, F5 recommends that you validate Cloud Failover Extension's configuration to confirm it can properly communicate with the cloud environment and what actions will be performed.

On the **Standby** instance:

1. Inspect the configuration to confirm all the BIG-IPs interfaces have been identified.

   Use the `/inspect <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information/paths/~1inspect/get>`_  endpoint to list associated cloud objects.

   For example:

   .. code-block:: bash

      curl -su admin: http://localhost:8100/mgmt/shared/cloud-failover/inspect | jq .
    
   |

2. Peform a Dry-Run of the Failover to confirm what addresses or routes have been identified and will be remapped. 

   Use the `/trigger <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Trigger>`_ endpoint with ``'{"action":"dry-run"}'`` payload.

   For example:

   .. code-block:: bash

      curl -su admin: -X POST -d '{"action":"dry-run"}' http://localhost:8100/mgmt/shared/cloud-failover/trigger | jq .
    
   |

If you run into any issues or errors, see the :ref:`troubleshooting` section for more details.

|

.. _declaration-components:

Components of the Declaration
-----------------------------

This section provides more information about the options in a Cloud Failover configuration, and breaks down the example declaration into each class so you can understand the options when composing your declaration. The tables below the code snippets contain descriptions and options for the properties. If there is a default value, it is shown in **bold** in the Options column.

.. Important:: 

    - Beginning with version v1.7.0, there are two options for configuring CFE. At a high level, they include:

      - Discovery via Tags: This involves discovering external cloud resources to manage by a set of tags (a deployment scoping tag and/or a configuration related tag) on the resources. This requires minimal configuration on the BIG-IP side and dynamically discovers external resources to manage.   
      - Explicit Configuration: This involves defining external resources to manage by name, address, etc. in the CFE configuration itself. This requires additional configuration on the BIG-IP side but facilitates advanced configurations and some automation workflows. Although Cloud Failover no longer requires tags on *external* resources, it may still require them on its own NICs or instance in some environments. See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details. 

.. _base-comps:

Base components
```````````````
The first few lines of your declaration are a part of the base components and are **required**.

First, you define the environment in which Cloud Failover will be running.

.. code-block:: json

   {
       "class": "Cloud_Failover",
       "environment": "aws",

|

+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Property           | Options                        | Description/Notes                                                                                                                                                            |
+====================+================================+==============================================================================================================================================================================+
| class              | Cloud_Failover                 | Top-level Cloud Failover class. Do not change this value.                                                                                                                    |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| environment        | aws, gcp, azure                | Provide the cloud environment you are using. See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details.                                                     |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

|

Next, you define the external storage Cloud Failover will use for its state file.

- Discovery via Tag example:

  .. code-block:: json

     "externalStorage": {
        "scopingTags": {
           "f5_cloud_failover_label": "mydeployment"
        }
     },

|

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``scopingName`` is available in Cloud Failover Extension v1.7.0 and later.

- Explicit Configuration example:

  .. code-block:: json

     "externalStorage":{
        "scopingName": "CloudFailoverBucket"
     },

|



|

+--------------------+--------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Property           | Options                        | Description/Notes                                                                                                                                                                               |
+====================+================================+=================================================================================================================================================================================================+
| externalStorage    | -                              | Provide scopingTags or scopingName object to define Cloud Failover's storage. See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details of what storage objects are used.      |
+--------------------+--------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| scopingTags        | -                              | Provide the key/value pair that match the cloud tags you assigned to the external storage in your cloud environment.                                                                            |
+--------------------+--------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| scopingName        | -                              | Provide the name of external storage in your cloud environment.                                                                                                                                 |
+--------------------+--------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

.. Note:: When you POST a declaration, depending on the complexity of your declaration and the modules you are provisioning, it may take some time before the system returns a success message.


The following base components are **optional**.

|

.. _base_comps-logging:

Logging
```````

Cloud Failover Extension logs to **/var/log/restnoded/restnoded.log**. The logging level is set in the ``controls`` class with possible values of ``silly``, ``verbose``, ``debug``, ``info``, ``warning``, and ``error``.

.. code-block:: json

   "controls": {
      "class": "Controls",
      "logLevel": "info"
   }

|

+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Property           | Options                                      | Description/Notes                                                                                                                                              |
+====================+==============================================+================================================================================================================================================================+
| controls           | -                                            | Provide various controls options.                                                                                                                              |
+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| class              | Controls                                     | Controls class. Do not change this value.                                                                                                                      |
+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| logLevel           | silly, verbose, debug, info, warning, error  | Provide the logging level to use. The default value is **info** although "silly" is highly recommended for first use, troubleshooting, and debugging.          |
+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+


See :ref:`logging-ref` for more details and example output levels.

|

.. _base_comps-retry:

Retry Failover Interval
```````````````````````
This feature is **optional** and, as part of floating object mapping validation, allows you to trigger failover periodically at an interval of your choosing.

.. code-block:: json

   "retryFailover": {
      "enabled": true,
      "interval": 2
   }

|

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``retryFailover`` is available in Cloud Failover Extension v1.6.0 and later.

|

+--------------------+--------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Property           | Options                        | Description/Notes                                                                                                                                              |
+====================+================================+================================================================================================================================================================+
| retryFailover      | -                              | Provide retry options.                                                                                                                                         |
+--------------------+--------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| enabled            | true, false                    | Specify if retrying failover is enabled. The default value is **false**                                                                                        |
+--------------------+--------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| interval           | -                              | Provide the failover retry interval. The interval unit is in minutes.                                                                                          |
+--------------------+--------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+

|

.. _failover-addresses:

Failover Addresses
``````````````````
The next lines of the declaration set the address failover functionality.

.. code-block:: json

        "failoverAddresses": {
            "enabled": true,

|

.. table::

   ======================== ======================= ===================================================================
   Property                 Options                 Description/Notes
   ======================== ======================= ===================================================================
   failoverAddresses        -                       Provide **address** failover configurations.
   ------------------------ ----------------------- -------------------------------------------------------------------
   enabled                  true, false             Enables or disables the address failover functionality. 
   ======================== ======================= ===================================================================

|


- Discovery via Tag example:

  .. code-block:: json

     "failoverAddresses": {
        "enabled": true,
        "scopingTags": {
           "f5_cloud_failover_label": "mydeployment"
        }
     },

|

- Explicit Configuration example:

  .. code-block:: json

     "failoverAddresses":{
        "enabled":true,
        "scopingTags": {
           "f5_cloud_failover_label": "mydeployment"
        }
        "addressGroupDefinitions": [
           {
              "type": "networkInterfaceAddress",
              "scopingAddress": "10.0.1.100"
           },
           {
              "type": "networkInterfaceAddress",
              "scopingAddress": "10.0.1.101"
           }
        ]
     },

|

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``addressGroupDefinitions`` is available in Cloud Failover Extension v1.7.0 and later.

|


.. table::

   ======================== ======================= ===================================================================
   Property                 Options                 Description/Notes
   ======================== ======================= ===================================================================
   scopingTags              -                       Provide a key/value pair that you have assigned to the resources in your cloud environment. This serves as the general "deployment" scoping tag. This property is required for AWS configurations. See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details on required additional tags.
   ------------------------ ----------------------- -------------------------------------------------------------------
   addressGroupDefinitions  -                       Provide address objects to failover. If you use this, you do not need to tag external address resources.  See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details of address types. 
   ======================== ======================= ===================================================================

|

.. Important:: In AWS, the ``scopingTags`` property is required in all configurations (for example, even when failoverAddresses is disabled and only failing over routes) as it is leveraged internally to map the peer BIG-IP's NICs.

.. code-block:: json

        "failoverAddresses":{
            "scopingTags": {
                "f5_cloud_failover_label": "mydeployment"
            }

|

 



.. _failover-routes:

Failover Routes
```````````````
The next lines of the declaration set the route failover functionality. 

.. code-block:: json

   "failoverRoutes": {
      "enabled": true,

|

.. table::

   ======================== ======================= ===================================================================
   Property                 Options                 Description/Notes
   ======================== ======================= ===================================================================
   failoverRoutes           -                       Provide **route** failover configurations.
   ------------------------ ----------------------- -------------------------------------------------------------------
   enabled                  true, false             Enables or disables the route failover functionality. If the failoverAddresses section is provided, the default is **true**.
   ======================== ======================= ===================================================================

|


- Discovery via Tag example:
   
  .. code-block:: json

     "failoverRoutes": {
        "enabled": true,
        "scopingTags": {
          "f5_cloud_failover_label": "mydeployment"
          },
          "scopingAddressRanges": [
             {
                "range": "192.168.1.0/24"
             },
             {
                "range": "192.168.1.1/24"
             }
          ],
          "defaultNextHopAddresses": {
             "discoveryType": "routetag"
          }
       }

|


- Explicit Configuration example:

  .. code-block:: json

     "failoverRoutes": {
        "enabled": true,
        "routeGroupDefinitions": [
           {
              "scopingName": "rtb-11111111111111111",
              "scopingAddressRanges": [
                 {
                    "range": "192.168.1.0/24",
                 },
                 {
                    "range": "192.168.1.1/24"
                 }
              ],
              "defaultNextHopAddresses": {
                 "discoveryType": "static",
                 "items": [
                    "192.0.2.10",
                    "192.0.2.11"
                 ]
              }
           }
        ]
     }




  The property ``routeGroupDefinitions`` provides more granular per-route table operations (F5 recommends using this option going forward). In the example above, ``scopingName`` is used to specify the exact route table to operate on and ``static`` in defaultNextHopAddresses to specify the nexthop Self-IP mappings.

|

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``routeGroupDefinitions`` is available in Cloud Failover Extension v1.5.0 and later.

|



|

.. table::

   ======================== ======================= ===================================================================
   Property                 Options                 Description/Notes
   ======================== ======================= ===================================================================
   scopingTags              -                       Provide a key/value pair used to discover route tables to perform updates on. The route table(s) are required to have this tag regardless of the ``discoveryType`` method used for the ``nextHopAddresses`` (or self IP mappings). NOTE: Although it can be used for simple deployments, the scope of this tag in the first example is global to the cluster/deployment and may discover multiple route tables. If you have routes that you specificially want to update in one table vs. another table (ex. 0.0.0.0 for an internal routing table and not on an external routing table), use the ``routeGroupDefinitions`` option.
   ------------------------ ----------------------- -------------------------------------------------------------------
   scopingAddressRanges     -                       A list of destination routes (prefixes) to update in the event of failover.
   ------------------------ ----------------------- -------------------------------------------------------------------
   defaultNextHopAddresses  -                       This is the default list of BIG-IP's Self IPs to point the routes (prefixes) to for any routes listed in ``scopingAddressRanges`` that do not have a more specific set of ``nextHopAddresses`` defined. See :ref:`example-multiple-next-hop` for an example declaration for multiple routing tables pointing to different nexthops.
   ------------------------ ----------------------- -------------------------------------------------------------------
   discoveryType            static, **routeTag**    In cases where BIG-IP has multiple NICs, CFE needs to know which interfaces it needs to re-map the routes to. It does this by using the Self IPs associated with those NICs. You can either define the Self IPs statically in the configuration `OR` in an additional cloud tag on the route table and have CFE discover them via tag.

                                                    - If you use ``static``, you will need to provide the Self-IPs in the ``items`` area of the CFE configuration.
                                                    - If you use ``routeTag``, you will need to add another tag to the route table in your cloud environment with the reserved key ``f5_self_ips``. For example, ``f5_self_ips:192.0.2.10,192.0.2.11``. See :ref:`example-route-tag` for an example configuration.

   ------------------------ ----------------------- -------------------------------------------------------------------
   items                    -                       List the Self IP address of each instance to route traffic to. This is only required when discoveryType is ``static``.
   ------------------------ ----------------------- -------------------------------------------------------------------
   routeGroupDefinitions    -                       List of route tables or route groups to update in the event of failover. This feature is available in CFE v1.5.0+ to support advanced routing scenarios. In AWS and Azure, ``routeGroupDefintions`` translates to route tables. GCP does not have route tables so it translates to groups or collections of routes. This option is intended for use in shared services and/or sandwich architectures with multiple BIG-IP clusters (which may share networks) and require per-route table granularity. For example, if you have routes that you specificially want update in one table vs. another (ex. 0.0.0.0 for only the internal routing table and not on the external routing table). See :ref:`advanced-routing-examples` for example declarations.
   ------------------------ ----------------------- -------------------------------------------------------------------
   scopingName              -                       String containing the name or ID of routing table to update. If you use this, you do not need to tag the route tables. See :ref:`advanced-routing-examples` for example declarations.
   ======================== ======================= ===================================================================

|



Endpoints
---------


- `declare <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Configuration>`_: user this endpoint to configure CFE.

- `info <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information>`_: use this endpoint to get information on CFE, such as the version number.

- `inspect <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information/paths/~1inspect/get>`_: use this endpoint to list associated cloud objects.

- `reset <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Reset>`_: use this endpoint to reset the failover state file.

- `trigger <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Trigger>`_: use this endpoint to trigger failover.



For more information see the `API Reference <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html>`_.




Using a Proxy
-------------

This extension supports making API calls through a proxy server for most cloud providers. It looks at the BIG-IP proxy configuration defined in system db variables. These can be viewed by running ``tmsh list sys db proxy``.

- AWS: All API calls will use the proxy.
- Azure: All control plane API calls will use the proxy. Storage upload/download (data-plane) calls will not use the proxy.
- GCP:  No API calls will use the proxy.  Please open an `issue <https://github.com/F5Networks/f5-cloud-failover-extension/issues>`_ if this is required in your environment.

Configuring BIG-IP proxy configuration:

.. code-block:: bash

   modify sys db proxy.host value 192.0.2.10
   modify sys db proxy.port value 3128
   modify sys db proxy.username value proxyuser
   modify sys db proxy.password value apassword
   modify sys db proxy.protocol value https

|


Cloud Environments
------------------

Choose the cloud environment you are working in to continue implementing CFE:

.. toctree::
   :maxdepth: 2
   :includehidden:
   :glob:

   aws
   gcp
   azure


.. include:: /_static/reuse/feedback.rst