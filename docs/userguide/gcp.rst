.. _gcp:

Google
======

Failover Event Diagram
----------------------

.. image:: ../images/GCPFailoverExtensionHighLevel.gif
  :width: 800

Prerequisites
-------------

- 2 clustered BIG-IPs in GCE. See example ARM templates on |github|.
- Network access to the Google metadata service
- A Google service account with sufficent access to update the indicated virtual machines and forwarding rules
- Virtual addresses created in a named traffic group and matching *Alias IP* addresses on the BIG-IP NICs serving application traffic
- Virtual machine instances tagged with the key(s) and value(s) from the *addressTags* section in the Failover Extension Configuration request
- Forwarding rules(s) configured with targets that match the self IP address of the active BIG-IP


Example Declaration
-------------------


.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-google-gdm-templates/tree/master/supported/failover/same-net/via-api/3nic/existing-stack/payg" target="_blank">F5 Cloud Failover site on GitHub</a>