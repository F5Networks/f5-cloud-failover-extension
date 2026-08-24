.. _update-revert:

Update or Revert Cloud Failover Extension
=========================================

.. _update-cfe:

Update Cloud Failover Extension
-------------------------------
When F5 releases a new version of Cloud Failover Extension, use the same procedure you used to initially install the RPM. For example, if you used the Configuration utility, when you click **Import** and then select the new RPM, the system recognizes you are upgrading Cloud Failover Extension.

|

.. _revert-cfe:

Revert to a previous version of Cloud Failover Extension
--------------------------------------------------------
If you need to revert to a previous version of Cloud Failover Extension, you must first remove the version of CFE that is already on your BIG-IP system:

On the BIG-IP user interface, click :guilabel:`iApps > Package Management LX > f5-cloud-failover > Uninstall`  

After you uninstall, you can :ref:`installation` for the version of CFE you want to use.


|

.. include:: /_static/reuse/feedback.rst