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


#. Paste the declaration into your API client, and modify names and IP addresses as applicable. The key and value pair can be arbitrary but they must match the tags or labels that you assign to the infrastructure within the cloud provider. You can craft your declaration with any key and value pair as long as it matches what is in the configuration. For example:

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

This section provides more information about the options in the Quick Start example, and breaks down the example declaration into each class so you can understand the options when composing your declaration. The tables below the code snippets contain descriptions and options for the parameters included in the quickstart example only. If there is a default value, it is shown in **bold** in the Options column.


.. _base-comps:

Base components
```````````````
The first few lines of your declaration are a part of the base components and define top-level options. When you POST a declaration, depending on the complexity of your declaration and the modules you are provisioning, it may take some time before the system returns a success message.

.. code-block:: json
   :linenos:

    {
        "class": "Cloud_Failover",
        "environment": "aws",
        "externalStorage": {
             "scopingTags": {
                 "f5_cloud_failover_label": "mydeployment"
            }
        },

   
             
|

+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Parameter          | Options                        | Description/Notes                                                                                                                                                            |
+====================+================================+==============================================================================================================================================================================+
| class              | Cloud_Failover                 | Describes top-level Cloud Failover options. Do not change this value.                                                                                                        |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| environment        | aws, gcp, azure                | This value defines which cloud environment you are using. See the :ref:`aws`, :ref:`gcp`, and :ref:`azure` sections for more details.                                        |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| externalStorage    | -                              | This is a json object. Do not change this value.                                                                                                                             |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| scopingTags        | -                              | These key/value pairs have to be the same as the tags you assign to the external storage in your cloud environment.                                                          |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+




.. _failover-addresses:

Failover Addresses
``````````````````
The next lines of the declaration set the failover addresses. 

.. code-block:: json
   :linenos:
   :lineno-start: 9

        "failoverAddresses": {
            "scopingTags": {
                "f5_cloud_failover_label": "mydeployment"
            }
        }
      },

|


+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Parameter          | Options                        |  Description/Notes                                                                                                                                               |
+====================+================================+==================================================================================================================================================================+
| failoverAddresses  | -                              | This is a json object. Do not change this value.                                                                                                                 |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| scopingTags        | -                              | These key/value pairs have to be the same as the tags you assign to the addresses in your cloud environment.                                                     |
+--------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------+



.. _failover-routes:

Failover Routes
```````````````
The next lines of the declaration set the failover routes. ``scopingAddressRanges`` is used to define which routes (prefixes) to update. 

.. code-block:: json
   :linenos:
   :lineno-start: 15

 
         "failoverRoutes": {
            "enabled": true,
            "scopingTags": {
               "f5_cloud_failover_label": "mydeployment"
            },
            "scopingAddressRanges": [
               {
                  "range": "192.168.1.0/24"
               }
            ],
            "defaultNextHopAddresses": {
               "discoveryType": "routetag"
            }
         }

|

The route failover feature provides various options for determining which routes or route tables to manage, from discovering them via cloud tags to specifying them directly in the configuration itself. 

For example, you can add tags to your routes or route table(s) to determine which ones to operate on and which interfaces (or nexthop Self-IP addresses) to point your routes to. Cloud Failover then uses:


- ``scopingTags`` to search for your routes or route table(s). For example, you add a tag ``"f5_cloud_failover_label": "mydeployment"`` to any route table(s) you want to manage.
- ``"discoveryType": "routeTag"`` to look for an additional tag which contains which nexthop Self-IP addresses it should point the routes to.  

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   The parameter ``routeGroupDefinitions`` is available in Cloud Failover Extension v1.5.0 and later.

|

Alternatively, you can explicitly provide the route tables and nexthop self-IP addresses in the configuration. Starting with Release v1.5.0, the parameter ``routeGroupDefinitions`` provides more granular per-route table operations (F5 recommends using this option going forward). In the example below, ``scopingName`` is used to specify the exact route table to operate on and ``static`` in defaultNextHopAddresses to specify the nexthop Self-IP mappings.
  

.. code-block:: json
   :linenos:
   :lineno-start: 15

         "failoverRoutes":{
            "enabled":true,
            "routeGroupDefinitions":[
               {
                  "scopingName":"rtb-11111111111111111",
                  "scopingAddressRanges":[
                     {
                        "range":"192.168.1.0/24",
                     },
                     {
                        "range":"192.168.1.1/24"
                     }
                  ],
                  "defaultNextHopAddresses":{
                     "discoveryType":"static",
                     "items":[
                        "192.0.2.10",
                        "192.0.2.11"
                     ]
                  }
               }
            ]
         }
      }


|

.. table::

   ======================== ======================= ===================================================================
   Parameter                Options                 Description/Notes
   ======================== ======================= ===================================================================
   failoverRoutes           -                       This is a json object. Do not change this value.
   ------------------------ ----------------------- -------------------------------------------------------------------
   enabled                  true,false              Enables or disables the route failover functionality.         
   ------------------------ ----------------------- -------------------------------------------------------------------
   routeGroupDefinitions    -                       List of route tables or route groups to update in the event of failover (Released in v1.5.0 to support advanced routing scenarios). NOTE: In AWS and Azure, ``routeGroupDefintions`` translates to route tables. GCP does not have route tables so it translates to groups or collections of routes. This option is intended for use in shared services and/or sandwich architectures with multiple BIG-IP clusters (which may share networks) and require per-route table granularity. For example, if you have routes that you specificially want update in one table vs. another (ex. 0.0.0.0 for only the internal routing table and not on the external routing table). See :ref:`advanced-routing-examples` for example declarations.
   ------------------------ ----------------------- -------------------------------------------------------------------
   scopingTags              -                       Key/value pair used to discover route tables to perform updates on.  The route table(s) are required to have this tag regardless of the discoveryType method used for the nextHopAddresses (or self-IP mappings). NOTE: Although can be used for simple deployments, the scope of this tag in the first example is global to the cluster/deployment and may discover multiple route tables. If you have routes that you specificially want to update in one table vs. another table (ex. 0.0.0.0 for an internal routing table and not on an external routing table, use the "routeGroupDefinitions" option ) 
   ------------------------ ----------------------- -------------------------------------------------------------------
   scopingAddressRanges     -                       A list of destination routes (prefixes) to update in the event of failover.
   ------------------------ ----------------------- -------------------------------------------------------------------
   defaultNextHopAddresses  -                       This json object is the default list of next hop addresses for any routes listed in ``scopingAddressRanges`` that do not have a more specific set of ``nextHopAddresses`` defined. See :ref:`example-multiple-next-hop` for an example declaration for multiple routing tables pointing to different nexthops.
   ------------------------ ----------------------- -------------------------------------------------------------------
   discoveryType            static, **routeTag**    In cases where BIG-IP has multiple NICs, CFE needs to know which interfaces it needs to re-map the routes to. It does this by using the Self-IPs associated with those NICs. You can either define the Self-IPs statically in the configuration `OR` in an additional cloud tag on the route table and have CFE discover them via tag.
                                                     
                                                    - If you use ``static``, you will need to provide the Self-IPs in the ``items`` area of the CFE configuration. 
                                                    - If you use ``routeTag``, you will need to add another tag to the route table in your cloud environment with the reserved key ``f5_self_ips``. For example, ``f5_self_ips:192.0.2.10,192.0.2.11``. See :ref:`example-route-tag` for an example configuration.
   
   ------------------------ ----------------------- -------------------------------------------------------------------
   items                    -                       List the Self IP address of each instance to route traffic to. This is only required when discoveryType is ``static``.    
   ------------------------ ----------------------- -------------------------------------------------------------------
   scopingName              -                       String containing name or id of routing table to update. If you use this, you do not need to tag the route tables. See :ref:`advanced-routing-examples` for example declarations.
   ======================== ======================= ===================================================================


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



Endpoints
---------


- `Info <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information>`_: use this endpoint to get information on CFE, such as the version number.

- `Reset <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Reset>`_: use this endpoint to reset the failover state file. 

- `Trigger <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Trigger>`_: use this endpoint to trigger failover.

For more information see the `API Reference <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html>`_.


.. include:: /_static/reuse/feedback.rst