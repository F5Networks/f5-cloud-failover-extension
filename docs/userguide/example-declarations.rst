.. _example-declarations:

Example Declarations
====================

Route Failover Using Route Tags
------------------------------

In certain scenarios it may be preferred to determine the next hop address during route failover by tagging the route itself with a tag.  This special key is named ``f5_self_ips`` and the value should contain a comma-separated list of addresses mapping to a self IP address on each instance in the cluster. For example: ``10.0.0.10,10.0.0.11``.  Once that is done the below declaration shows how to configure the solution to look for that tag.

.. literalinclude:: ../../examples/declarations/routeFailoverUsesRouteTags.json
   :language: json
   :tab-width: 4