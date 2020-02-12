.. _example-declarations:

Additional Declarations
=======================

Route Failover Using Route Tags
-------------------------------

For backwards compatability, you can tag the route itself with a tag to determine the next hop address during route failover. This special key is named ``f5_self_ips`` and the value should contain a comma-separated list of addresses mapping to a self IP address on each instance in the cluster. For example: ``10.0.0.10,10.0.0.11``. Once that is done the below declaration shows how to configure the solution to look for that tag.

.. literalinclude:: ../../examples/declarations/routeFailoverUsesRouteTags.json
   :language: json
   :tab-width: 4
   :emphasize-lines: 24

:fonticon:`fa fa-download` :download:`routeFailoverUsesRouteTags.json <../../examples/declarations/routeFailoverUsesRouteTags.json>`


AWS IPv6 Route Failover
-----------------------


.. literalinclude:: ../../examples/declarations/ipv6RouteFailover.json
   :language: json
   :tab-width: 4
   :emphasize-lines: 31-32

:fonticon:`fa fa-download` :download:`ipv6RouteFailover.json <../../examples/declarations/ipv6RouteFailover.json>`

Example Declaration Setting the Log Level
-----------------------------------------

You set the log level in the controls class. To see more information about editing the controls class, see :ref:`logging-ref`.


.. literalinclude:: ../../examples/declarations/settingLogLevel.json
   :language: json
   :tab-width: 4
   :emphasize-lines: 31-33

:fonticon:`fa fa-download` :download:`settingLogLevel.json <../../examples/declarations/settingLogLevel.json>`
