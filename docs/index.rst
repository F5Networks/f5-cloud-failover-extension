F5 Cloud Failover
=================

Introduction
------------

The purpose of the F5 Cloud Failover (CF) iControl LX extension is to provide L3 failover functionality in cloud environments, effectively replacing Gratuitous ARP (GARP).  This requires moving/updating certain cloud resources during a failover event, as described below.

- Failover IP(s) - Update IP configurations on a NIC, update EIP associations, update forwarding rule target instance, etc.
- Failover Route(s) - Update User-Defined Routes (UDR), update route table, etc.

.. image:: ../contributing/images//FailoverExtensionHighLevel.gif
  :width: 800

User Guide Index
----------------

.. toctree::
   :maxdepth: 2
   :includehidden:
   :glob:

   revision-history