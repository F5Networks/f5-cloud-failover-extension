.. _quickstart:

Quickstart 
==========

If you are familiar with the BIG-IP system, and generally familiar with REST and
using APIs, this section contains the minimum amount of information to get you
up and running with Cloud Failover.

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   Cloud Failover Extension supports BIG-IP version 14.1.X and later.


#. Download the latest RPM package from |github|.

#. Upload and install the RPM package using the BIG-IP GUI:

   - :guilabel:`Main tab > iApps > Package Management LX > Import`

   .. image:: ../images/cloud-failover-import.png
     :width: 800 

   - Select the downloaded file and click :guilabel:`Upload`
   - For complete instructions see :ref:`installgui-ref` or :ref:`installcurl-ref`
    

#. Be sure to see the |known-issues| to review any known issues and other important information before you attempt to use Cloud Failover Extension.

#. Provide authorization (basic auth) to the BIG-IP system:  

   - If using a RESTful API client like Postman, in the :guilabel:`Authorization` tab, type the user name and password for a BIG-IP user account with Administrator permissions.
   - If using cURL, see :ref:`installcurl-ref`.

#. Using a RESTful API client like Postman, send a GET request to the URI
   ``https://{{host}}/mgmt/shared/cloud-failover/info`` to ensure Cloud Failover Extension is running
   properly. You should receive an expect response of Success after you have posted this declaration. For example:

   .. code-block:: shell

    {
        "message": "success"
    }


#. Copy one of the example declarations which best matches the configuration you want to use. There are example declarations in the sections for :ref:`azure`, :ref:`aws`, and :ref:`gcp`.

#. Paste the declaration into your API client, and modify names and IP addresses as applicable. The key and value pair can be arbitrary but they must match the tags that you assign to the infrastructure within the cloud provider. You can craft your declaration with any key and value pair as long as it matches what is in the configuration. For example:

   .. code-block:: shell
   
     "failoverAddresses": {
             "scopingTags": {
               "i_am_an_arbitrary_key": "i_am_an_arbitrary_value"
             }



#. POST to the URI ``https://<BIG-IP>/mgmt/shared/cloud-failover/declare``
  
   .. IMPORTANT:: You must POST the initial configuration to each device at least once for the appropriate system hook configuration to enable failover via CFE. Additional configuration operations can be sent to a single device.

#. To stream the output of restnoded, use the tail command: ``tail –f /var/log/restnoded/restnoded.log``


Quick Start Example
-------------------

Here is an example declaration for Microsoft Azure.

.. literalinclude:: ../../examples/declarations/quickstart.json
   :language: json
   :tab-width: 4
   :linenos:

:fonticon:`fa fa-download` :download:`quickstart.json <../../examples/declarations/quickstart.json>`

|

You will receive a response from Postman that looks like this example:

.. code-block:: json

    {
      "message": "success",
      "declaration": "..."
    }

|

.. _declaration-components:

Components of the Declaration
-----------------------------

This section provides more information about the options in the Quick Start example, and breaks down the example declaration into each class so you can understand the options when composing your declaration. The tables below the code snippets contain descriptions and options for the parameters included in the `quickstart example only`. If there is a default value, it is shown in **bold** in the Options column.


.. _base-comps:

Base components
```````````````
The first few lines of your declaration are a part of the base components and define top-level options. When you POST a declaration, depending on the complexity of your declaration and the modules you are provisioning, it may take some time before the system returns a success message.

.. code-block:: json
   :linenos:

    {
        "class": "Cloud_Failover",
        "environment": "azure",
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
| environment        | aws, azure, gcp                | This value defines which cloud environment you are using. See the :ref:`aws`, :ref:`azure`, and :ref:`gcp` sections for more details.                                        |
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
The next lines of the declaration sets the failover routes. The scoping address range filters down which route tables and which specific routes in the route table should have the next hop address updated in the event of a failover. The scoping address ranges should match the CIDR blocks of any routes that you want to follow the active BIG-IP.


.. code-block:: json
   :linenos:
   :lineno-start: 14


        "failoverRoutes": {
		    "scopingTags": {
			    "f5_cloud_failover_label": "mydeployment"
		    },
		    "scopingAddressRanges": [
			    {
				    "range": "192.168.1.0/24"
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
    }



|


+-------------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| Parameter               | Options                        |  Description/Notes                                                                                                                                                                                                                                                                                                                                                                             |
+=========================+================================+================================================================================================================================================================================================================================================================================================================================================================================================+
| failoverRoutes          | -                              | This is a json object. Do not change this value.                                                                                                                                                                                                                                                                                                                                               |
+-------------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| scopingTags             | -                              | These key/value pairs have to be the same as the tags you assign to the addresses in your cloud environment.                                                                                                                                                                                                                                                                                   |
+-------------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| scopingAddressRanges    | -                              | A list of the destination routes to update in the event of failover.                                                                                                                                                                                                                                                                                                                           |
+-------------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| defaultNextHopAddresses | -                              | This is a json object. Do not change this value.                                                                                                                                                                                                                                                                                                                                               |
+-------------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| discoveryType           | static, **routeTag**           | If ``static``, the addresses that you provide in the ``items`` area are the addresses you want to failover against. If you use ``routeTag``, you do not need to list items, but you will need to add another tag to the route table with the reserved key ``f5_self_ips``. For example, ``f5_self_ips:192.0.2.10,192.0.2.11``. See :ref:`example-declarations`.                                |
+-------------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| items                   | -                              | List the Self IP address of each instance. This is only required when discoveryType is ``static``.                                                                                                                                                                                                                                                                                             |
+-------------------------+--------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+



|


.. include:: /_static/reuse/feedback.rst


.. |github| raw:: html

   <a href="https://github.com/f5devcentral/f5-cloud-failover-extension/releases" target="_blank">F5 Cloud Failover Extension site on GitHub</a>

   
.. |known-issues| raw:: html

   <a href="https://github.com/F5Devcentral/f5-cloud-failover-extension/issues" target="_blank">Known Issues on GitHub</a>


