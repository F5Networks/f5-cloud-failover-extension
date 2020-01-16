.. _logging-ref:

Logging
=======

Cloud Failover Extension logs to **/var/log/restnoded.log**.
The logging level is set in the "controls" class with possible values of 'silly', 'verbose', 'debug', 'info', 'warning', and 'error'. The default value is **info**. This controls object is sent via a POST /declare.

.. code-block:: json

    {
        "controls": {
            "class": "Controls",
            "logLevel": "info"
        }
    }

You can see an example of a full declaration in :ref:`example-declarations`.


Example log entries for different levels
----------------------------------------

Silly
`````
The silly value logs everything.

.. code-block:: bash

   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Setting controls log level
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Global logLevel set to 'silly'
   Thu, 19 Dec 2019 19:39:26 GMT - finest: [f5-cloud-failover] Modifying existing data group f5-cloud-failover-state with body{...}
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Successfully wrote Failover trigger scripts to filesystem
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Performing failover - init 
   Thu, 19 Dec 2019 19:39:26 GMT - fine: [f5-cloud-failover] config: {}
   Thu, 19 Dec 2019 19:39:26 GMT - finest: [f5-cloud-failover] Storage Account Information: {...}
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Successfully wrote Failover trigger scripts to filesystem



Info
````
The info value will log information and errors.

.. code-block:: bash

   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Setting controls log level
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Global logLevel set to 'info'
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Successfully wrote Failover trigger scripts to filesystem
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Performing failover - init 
   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Successfully wrote Failover trigger scripts to filesystem



Error
`````
The error value will log only errors.

.. code-block:: bash

   Thu, 19 Dec 2019 19:39:26 GMT - info: [f5-cloud-failover] Global logLevel set to 'error'
   Thu, 19 Dec 2019 19:41:26 GMT - error: [f5-cloud-failover] uploadDataToStorage error: {...} 

