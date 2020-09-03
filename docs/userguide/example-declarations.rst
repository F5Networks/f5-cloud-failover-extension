.. _example-declarations:

Example Declarations
====================

.. _advanced-routing-examples:

Advanced Routing: Multiple Route Tables, Routes, Nexthops and Subscriptions
---------------------------------------------------------------------------
The following examples leverage the object called "routeGroupDefintions" (released in v1.5.0) to support advanced routing scenarios. *NOTE*: In AWS and Azure, ``routeGroupDefintions`` translates to route tables. GCP does not have the concept of route tables so translates to groups or collections of routes. Advanced routing examples include operating in shared services and/or sandwich architectures with multiple BIG-IP clusters (which may share networks) that require per-route table granularity. 

  - ``scopingName`` is used to explicity provide the ``name`` or ``id`` of the route table to update (vs. tagging the route table with a scopingTag. See :ref:`example-route-tag`)
  - ``scopingAddressRanges`` are used to limit updating a particular route (or list of routes) in that table. 
  - ``defaultNextHopAddresses`` can be used to specify that each route go to different BIG-IP interfaces (in a multi-nic deployment where you have an external and internal interface, multiple internal interfaces, etc.). 
  - ``static`` is used to explicitly provide nexthop Self-IP address mappings  (vs. providing the mappings in tags on the route table)


AWS
```

.. literalinclude:: ../../examples/declarations/awsMultipleRoutingTables.json
   :language: json
   :caption: AWS Advanced Routing
   :tab-width: 4
   :linenos:

:fonticon:`fa fa-download` :download:`awsMultipleRoutingTables.json <../../examples/declarations/awsMultipleRoutingTables.json>`

GCP
```

.. literalinclude:: ../../examples/declarations/gcpMultipleRoutingGroupDefinitons.json
   :language: json
   :caption: GCP Advanced Routing
   :tab-width: 4
   :linenos:

:fonticon:`fa fa-download` :download:`gcpMultipleRoutingTables.json <../../examples/declarations/gcpMultipleRoutingGroupDefinitons.json>`

Azure
`````

.. literalinclude:: ../../examples/declarations/azureMultipleRoutingTables.json
   :language: json
   :caption: Azure Advanced Routing
   :tab-width: 4
   :linenos:

:fonticon:`fa fa-download` :download:`azureMultipleRoutingTables.json <../../examples/declarations/azureMultipleRoutingTables.json>`


.. _example-route-tag:

Route Failover Using Route Tags
-------------------------------
For backwards compatability, you can use tags on the route tables to discover them and provide nexthop Self-IP address mappings. For example, the route table will need two tags, one with the scoping tag (arbitrary key/value) and one with the special key ``f5_self_ips`` and value value that contains a comma-separated list of addresses mapping to a Self-IP address on each instance in the cluster. 

  - ``"f5_cloud_failover_label": "route-table-1"`` 
  - ``"f5_self_ips": "10.0.0.10,10.0.0.11"`` 
   
Once the route table is tagged with above, the below declaration shows how to configure the solution to look for those tags and nexthop Self-IP address mappings.

.. include:: /_static/reuse/discovery-type-note.rst

.. literalinclude:: ../../examples/declarations/advancedRouteDefinitionsTags.json
   :language: json
   :caption: Route Failover using Route Tags
   :tab-width: 4
   :linenos:
   :emphasize-lines: 19-21,35-37


:fonticon:`fa fa-download` :download:`advancedRouteDefinitionsTags.json <../../examples/declarations/advancedRouteDefinitionsTags.json>`


.. _example-multiple-next-hop:

Multiple Next Hop addresses
---------------------------
This example shows a declaration for Route Failover for Multiple Route Tables and routes pointing at different BIG-IP interfaces/Self-IP nexthops. In the example below, two route tables are tagged with the same tag (``f5_cloud_failover_label":"mydeployment``) to provide scoping for the deployment (BIG-IP instance or cluster) but the different Self-IP nexthop mappings are provided explicitly in the declaration (vs. with a ``f5_self_ips`` tag).

.. Note:: F5 Recommends using the newer ``routeGroupDefinitions`` object instead. See :ref:`advanced-routing-examples`.

.. literalinclude:: ../../examples/declarations/multipleRoutingTables.json
   :language: json
   :caption: Multiple Next Hop Addresses
   :tab-width: 4
   :linenos:
   :emphasize-lines: 23-29,33-39

:fonticon:`fa fa-download` :download:`multipleNextHopAddresses.json <../../examples/declarations/multipleRoutingTables.json>`


AWS IPv6 Route Failover
-----------------------
This example shows a declaration for IPv6 routes.

.. literalinclude:: ../../examples/declarations/ipv6RouteFailover.json
   :language: json
   :caption: AWS IPv6 Route Failover
   :tab-width: 4
   :linenos:
   :emphasize-lines: 28-30,37-38

:fonticon:`fa fa-download` :download:`ipv6RouteFailover.json <../../examples/declarations/ipv6RouteFailover.json>`


Azure Route Tables in Multiple Subscriptions
--------------------------------------------
This example shows a BIG-IP cluster managing route tables in multiple subscriptions. The identity (MSI) assigned to each BIG-IP instance must have appropriate access to the additional subscriptions, see :ref:`azure-msi` for more details. 

.. Note:: By default, the cloud failover extension looks in the subscription in which the instances are deployed. The example below looks in three different subscriptions, the one the instances are deployed in as well as 1111 and 2222.

.. literalinclude:: ../../examples/declarations/azureRouteTablesInMutipleSubscriptions.json
   :language: json
   :caption: Azure Route Tables in Multiple Subscriptions
   :tab-width: 4
   :linenos:
   :emphasize-lines: 32-39

:fonticon:`fa fa-download` :download:`azureRouteTablesInMutipleSubscriptions.json <../../examples/declarations/azureRouteTablesInMutipleSubscriptions.json>`


Example Declaration Setting the Log Level
-----------------------------------------

You set the log level in the controls class. To see more information about editing the controls class, see :ref:`logging-ref`.


.. literalinclude:: ../../examples/declarations/settingLogLevel.json
   :language: json
   :caption: Setting the Log Level
   :tab-width: 4
   :linenos:
   :emphasize-lines: 4-7

:fonticon:`fa fa-download` :download:`settingLogLevel.json <../../examples/declarations/settingLogLevel.json>`


.. include:: /_static/reuse/feedback.rst