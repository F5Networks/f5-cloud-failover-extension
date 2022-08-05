.. _troubleshooting:

Troubleshooting
===============
Use this section to read about known issues and for common troubleshooting steps. To provide feedback on this documentation, you can file a |github|.

Cloud Failover Extension general troubleshooting tips
-----------------------------------------------------

- Examine the REST response:

  - A 400-level response will carry an error message. See the Troubleshooting Index below.
  - If the error message is missing, incorrect, or misleading, please let us know by filing a |github|.

- If CFE is installed and configured but not functioning as expected, use your preferred REST client to run these steps on the *Standby* instance. For illustration purposes, the examples below use `curl` on the BIG-IP itself and the utililty `jq` to pretty print the JSON output.

  1. **Enable Debug Logging:** Set CFE configuration :ref:`logging-ref` level to `silly`.

     - Download the config: 
  
     .. code-block:: bash
    
        curl -su admin: -X GET http://localhost:8100/mgmt/shared/cloud-failover/declare |  jq .declaration > cfe.json


     - Use your preferred editor to configure debug logging (``"logLevel": "silly"``). Click `here <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/example-declarations.html#example-declaration-setting-the-log-level>`_ to see an example control block with debug logging:

     .. code-block:: bash
    
        vim cfe.json

     - Repost to update the config:

     .. code-block:: bash

        curl -su admin: -X POST -d @cfe.json http://localhost:8100/mgmt/shared/cloud-failover/declare | jq .


  2. **Reset the Statefile:**

     .. code-block:: bash
    
        curl -su admin: -X POST -d '{"resetStateFile":true}' http://localhost:8100/mgmt/shared/cloud-failover/reset | jq .


  3. **Validate by using additional CFE endpoints to run Inspect and Dry-Run on the Standby Instance:**

     .. code-block:: bash
    
        curl -su admin: http://localhost:8100/mgmt/shared/cloud-failover/inspect | jq .
        curl -su admin: -X POST -d '{"action":"dry-run"}' http://localhost:8100/mgmt/shared/cloud-failover/trigger | jq .

  4. **Review the debug logs.** (``/var/log/restnoded/restnoded.log``).



|

Troubleshooting Index
---------------------

Use this section for specific troubleshooting help.

|

Verifying IP addresses and Routes for Failover
``````````````````````````````````````````````
- You can verify the objects that will change from the standby device (for example, BIG-IP 2) when it fails over by providing a payload body message ``'{"action":"dry-run"}'`` for the POST `/trigger <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Trigger>`_ endpoint.
- To examine the failover objects (IP addresses and routes) that are associated with any given BIG-IP device, you can do a GET request on the `/inspect <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Information/paths/~1inspect/get>`_ endpoint of the device to get a list of failover objects.

|

-----------------------------------------

|

I'm receiving a **path not registered** error when I try to post a declaration
``````````````````````````````````````````````````````````````````````````````

If you are receiving this error, it means either you did not install Cloud Failover Extension, or it did not install properly. The error contains the following message:

.. code-block:: shell

    {
        "code":404,
        "message": "Public URI path no registered. Please see /var/log/restjavad.0.log and /var/log/restnoded/restnoded.log for details.".
        ...
    }


If you receive this error, see :doc:`installation` to install or re-install Cloud Failover Extension.

|

-----------------------------------------

|

I'm receiving a **400** error when I try to post a declaration with no additional helpful message
`````````````````````````````````````````````````````````````````````````````````````````````````

If you are receiving this error, it typically means the provider prerequisites have not been met and there is an issue performing initialization operations.  Please review the provider prerequisites sections for more information.

|

-----------------------------------------

|

I'm receiving a **recovery operations are empty** error when failover is triggered or I need to reset the state of my failover extension
````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````````

If you receive this error, it means Cloud Failover Extension had a previous failure which left it in a bad state. F5 recommends performing a reset of the state file using the `/reset` endpoint, which is described in the `API Reference documentation <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Reset>`_.

|

-----------------------------------------

|

I'm receiving a **404** error after upgrading the BIG-IP version
````````````````````````````````````````````````````````````````

F5 is currently tracking this issue (929213). Currently the workaround is that f5-cloud-failover RPM needs to be re-uploaded.

|

-----------------------------------------

|

Failover objects are not mapped to the Active BIG-IP after a cluster reboot
```````````````````````````````````````````````````````````````````````````
After both BIG-IP VMs have been rebooted, sometimes failover objects are not mapped to the Active BIG-IP.

#. BIG-IP 2 is Active (and has failover objects)
#. Shutdown BIG-IP 1
#. Shutdown BIG-IP 2
#. Start BIG-IP 1
#. Wait 1 minute
#. Start BIG-IP 2
#. BIG-IP 1 should be Active (and have failover objects)

Failover under these conditions normally works as long as restnoded comes up before HA status is determined and tgactive is called.

If, during a reboot, the objects are mapped to the wrong BIG-IP, you can force a failover event by POSTing to the `/trigger <https://clouddocs.f5.com/products/extensions/f5-cloud-failover/latest/userguide/apidocs.html#tag/Trigger>`_ endpoint of the **currently active** BIG-IP.

|

-----------------------------------------

|

.. include:: /_static/reuse/feedback.rst

.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension/issues" target="_blank">GitHub Issue</a>

