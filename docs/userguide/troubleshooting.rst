.. _troubleshooting:

Troubleshooting
===============
Use this section to read about known issues and for common troubleshooting steps. To provide feedback on this documentation, you can file a |github|.

Cloud Failover Extension general troubleshooting tips
-----------------------------------------------------

- Examine the restnoded failure log at ``/var/log/restnoded/restnoded.log``. This is where Cloud Failover Extension records error messages.
- Examine the REST response:

  - A 400-level response will carry an error message.
  - If this message is missing, incorrect, or misleading, please let us know by filing a |github|.


Troubleshooting Index
---------------------

Use this section for specific troubleshooting help.

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

I'm receiving a **400** error when I try to post a declaration with no additional helpful message
`````````````````````````````````````````````````````````````````````````````````````````````````

If you are receiving this error, it typically means the provider prerequisites have not been met and there is an issue performing initialization operations.  Please review the provider prerequisites sections for more information.

I'm receiving a **recovery operations are empty** error when failover is triggered
``````````````````````````````````````````````````````````````````````````````````

If you receive this error, it means Cloud Failover Extension had a previous failure which left it in a bad state.  Recommended performing a reset of the state file using the `reset` endpoint, which is described in the API Reference documentation.


|

.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension/issues" target="_blank">GitHub Issue</a>