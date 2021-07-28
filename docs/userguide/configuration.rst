.. _configure:

Configure Cloud Failover Extension
==================================

Once the Package is installed, you will use the REST endpoints to configure the Cloud Failover Extension.

#. Using a RESTful API client like Postman, send a GET request to the URI
   ``https://{{host}}/mgmt/shared/cloud-failover/info`` to ensure Cloud Failover Extension is running
   properly. You should receive an expect response of `success` after you have posted this declaration. For example:

   .. code-block:: shell

    {
        "message": "success"
    }


#. Copy one of the :ref:`example-declarations` which best matches the configuration you want to use. See each provider section for additional details and requirements.

   - :ref:`aws`
   - :ref:`gcp`
   - :ref:`azure`


#. Paste the declaration into your API client, and modify names and/or IP addresses as applicable. The key and value pair can be arbitrary but they must match the tags or labels that you assign to the infrastructure within the cloud provider. You can craft your declaration with any key and value pair as long as it matches what is in the configuration. For example:

   .. code-block:: shell

     "failoverAddresses": {
             "scopingTags": {
               "i_am_an_arbitrary_key": "i_am_an_arbitrary_value"
             }



#. POST to the URI ``https://<BIG-IP>/mgmt/shared/cloud-failover/declare``

   .. IMPORTANT::

      You must POST the initial configuration to each device at least once for the appropriate system hook configuration to enable failover via CFE. After that, additional configuration operations can be sent to a single device.

#. To stream the output of restnoded, use the tail command: ``tail –f /var/log/restnoded/restnoded.log``

|

.. _declaration-components:

Components of the Declaration
-----------------------------

This section provides more information about the options in a Cloud Failover configuration, and breaks down the example declaration into each class so you can understand the options when composing your declaration. The tables below the code snippets contain descriptions and options for the properties. If there is a default value, it is shown in **bold** in the Options column.

IMPORTANT: Beginning with version v1.7.0, there are two options for configuring CFE. At a high level, they include
   - Discovery via Tags: This involves discovering external cloud resources to manage by a set of tags (a deployment scoping tag and/or a configuration related tag) on the resources. This requires minimal configuration on the BIG-IP side and dynamically discovers external resources to manage.   
   - Explicit Configuration: This involves defining external resources to manage by name, address, etc. in the CFE configuration itself. This requires additional configuration on the BIG-IP side but facilitates advanced configurations and some automation workflows. 
      - NOTE: Although Cloud Failover no longer requires tags on *external* resources, it may still require them on its own NICs or instance in some environments. See your provider :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details. 

.. _base-comps:

Base components
```````````````
The first few lines of your declaration are a part of the base components and are required. The

First you define the environment in which Cloud Failover will be running.

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


Next you define the external storage Cloud Failover will use for its state file. 

Discovery via Tag example:

.. code-block:: json

        "externalStorage": {
            "scopingTags": {
                 "f5_cloud_failover_label": "mydeployment"
            }
        },

|

Explicit Configuration example:

.. code-block:: json

   "externalStorage":{
      "scopingName": "CloudFailoverBucket"
   },

|

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``scopingName`` is available in Cloud Failover Extension v1.7.0 and later.

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

When you POST a declaration, depending on the complexity of your declaration and the modules you are provisioning, it may take some time before the system returns a success message.

The following base components are optional.


.. _base_comps-logging:

Logging
```````

Cloud Failover Extension logs to **/var/log/restnoded/restnoded.log**.

The logging level is set in the ``controls`` class with possible values of 'silly', 'verbose', 'debug', 'info', 'warning', and 'error'.

.. code-block:: json

        "controls": {
            "class": "Controls",
            "logLevel": "info"
        }

|

+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Property           | Options                                      | Description/Notes                                                                                                                                              |
+====================+==============================================+================================================================================================================================================================+
| controls           | -                                            | Provide various controls options                                                                                                                               |
+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| class              | Controls                                     | Controls class. Do not change this value.                                                                                                                      |
+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+
| logLevel           | silly, verbose, debug, info, warning, error  | Provide the logging level to use. The default value is **info** although "silly" is highly recommended for first use, troubleshooting and debugging.           |
+--------------------+----------------------------------------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------+


See :ref:`logging-ref` for more details and example output levels.


.. _base_comps-retry:


Retry Failover Interval
```````````````````````
As part of floating object mapping validation, this feature is added to have the failover trigger periodically on a user-defined interval.

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
   enabled                  true,false              Enables or disables the address failover functionality. 
   ======================== ======================= ===================================================================

|


Discovery via Tag example:

.. code-block:: json

        "failoverAddresses": {
            "enabled": true,
            "scopingTags": {
                "f5_cloud_failover_label": "mydeployment"
            }
        },

|

Explicit Configuration example:

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
   scopingTags              -                       Provide a key/value pair that you have assigned to the resources in your cloud environment. This serves as the general "deployment" scoping tag.  See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details on required additional tags.
   ------------------------ ----------------------- -------------------------------------------------------------------
   addressGroupDefinitions  -                       Provide address objects to failover. If you use this, you do not need to tag external address resources.  See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details of address types. 
   ======================== ======================= ===================================================================

|

IMPORTANT: In AWS, the scopingTags is required in all configurations (for example, even when failoverAddresses is disabled and only failing over routes):

.. code-block:: json

        "failoverAddresses":{
            "scopingTags": {
                "f5_cloud_failover_label": "mydeployment"
            }

|

as it is leveraged internally to map the peer BIG-IP's NICs. 



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
   enabled                  true,false              Enables or disables the route failover functionality. If the failoverAddresses section is provided, the default is **true**.
   ======================== ======================= ===================================================================

|


Discovery via Tag example:
   
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


Explicit Configuration example:

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
      }


|

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The property ``routeGroupDefinitions`` is available in Cloud Failover Extension v1.5.0 and later.

|

The property ``routeGroupDefinitions`` provides more granular per-route table operations (F5 recommends using this option going forward). In the example below, ``scopingName`` is used to specify the exact route table to operate on and ``static`` in defaultNextHopAddresses to specify the nexthop Self-IP mappings.


.. table::

   ======================== ======================= ===================================================================
   Property                 Options                 Description/Notes
   ======================== ======================= ===================================================================
   scopingTags              -                       Provide a key/value pair used to discover route tables to perform updates on.  The route table(s) are required to have this tag regardless of the discoveryType method used for the nextHopAddresses (or self-IP mappings). NOTE: Although can be used for simple deployments, the scope of this tag in the first example is global to the cluster/deployment and may discover multiple route tables. If you have routes that you specificially want to update in one table vs. another table (ex. 0.0.0.0 for an internal routing table and not on an external routing table, use the "routeGroupDefinitions" option )
   ------------------------ ----------------------- -------------------------------------------------------------------
   scopingAddressRanges     -                       A list of destination routes (prefixes) to update in the event of failover.
   ------------------------ ----------------------- -------------------------------------------------------------------
   defaultNextHopAddresses  -                       This is the default list of BIG-IP's Self-IPs to point the routes (prefixes) to for any routes listed in ``scopingAddressRanges`` that do not have a more specific set of ``nextHopAddresses`` defined. See :ref:`example-multiple-next-hop` for an example declaration for multiple routing tables pointing to different nexthops.
   ------------------------ ----------------------- -------------------------------------------------------------------
   discoveryType            static, **routeTag**    In cases where BIG-IP has multiple NICs, CFE needs to know which interfaces it needs to re-map the routes to. It does this by using the Self-IPs associated with those NICs. You can either define the Self-IPs statically in the configuration `OR` in an additional cloud tag on the route table and have CFE discover them via tag.

                                                    - If you use ``static``, you will need to provide the Self-IPs in the ``items`` area of the CFE configuration.
                                                    - If you use ``routeTag``, you will need to add another tag to the route table in your cloud environment with the reserved key ``f5_self_ips``. For example, ``f5_self_ips:192.0.2.10,192.0.2.11``. See :ref:`example-route-tag` for an example configuration.

   ------------------------ ----------------------- -------------------------------------------------------------------
   items                    -                       List the Self IP address of each instance to route traffic to. This is only required when discoveryType is ``static``.
   ------------------------ ----------------------- -------------------------------------------------------------------
   routeGroupDefinitions    -                       List of route tables or route groups to update in the event of failover (Released in v1.5.0 to support advanced routing scenarios). NOTE: In AWS and Azure, ``routeGroupDefintions`` translates to route tables. GCP does not have route tables so it translates to groups or collections of routes. This option is intended for use in shared services and/or sandwich architectures with multiple BIG-IP clusters (which may share networks) and require per-route table granularity. For example, if you have routes that you specificially want update in one table vs. another (ex. 0.0.0.0 for only the internal routing table and not on the external routing table). See :ref:`advanced-routing-examples` for example declarations.
   ------------------------ ----------------------- -------------------------------------------------------------------
   scopingName              -                       String containing name or id of routing table to update. If you use this, you do not need to tag the route tables. See :ref:`advanced-routing-examples` for example declarations.
   ======================== ======================= ===================================================================

|



Endpoints
---------


- `Info <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information>`_: use this endpoint to get information on CFE, such as the version number.

- `Inspect <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information/paths/~1inspect/get>`_: use this endpoint to list associated cloud objects.

- `Reset <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Reset>`_: use this endpoint to reset the failover state file.

- `Trigger <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Trigger>`_: use this endpoint to trigger failover.



For more information see the `API Reference <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html>`_.




Using a Proxy
-------------

This extension supports making API calls through a proxy server for most cloud providers.  It looks at the BIG-IP proxy configuration defined in system db variables, these can be viewed by running `tmsh list sys db proxy.*`.

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


Validation
----------

On any initial configuration or re-configuration, it is recommended you validate Cloud Failover Extension's configuration to confirm it can properlycommunicate with the cloud environment and what actions will be performed.

On the **Standby** instance:

1. Inspect the configuration: To confirm all the BIG-IPs interfaces have been identified.
    Use the `/inspect endpoint <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information/paths/~1inspect/get>`_:  to list associated cloud objects.

    For example:

    .. code-block:: bash

        curl -su admin: http://localhost:8100/mgmt/shared/cloud-failover/inspect | jq .
    
    |

2. Peform a Dry-Run of the Failover: To confirm what addresses or routes have been identified and will be remapped. 
    Use the `/trigger endpoint <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Trigger>`_: with '{"action":"dry-run"}' payload

    For example:

    .. code-block:: bash

        curl -su admin: -X POST -d '{"action":"dry-run"}' http://localhost:8100/mgmt/shared/cloud-failover/trigger | jq .
    
    |

If you run into any issues or errors, see the :ref:`troubleshooting` for more details.



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