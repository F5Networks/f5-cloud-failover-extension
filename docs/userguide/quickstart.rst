.. _quickstart:

Quickstart 
==========

If you are familiar with the BIG-IP system, and generally familiar with REST and
using APIs, this section contains the minimum amount of information to get you
up and running with Cloud Failover.

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   Cloud Failover Extension supports BIG-IP version 14.1.X and later.


#. Download the latest RPM package from |github|.

#. Upload and install the RPM package on the using the BIG-IP GUI:

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

#. To stream the output of restnoded, use the tail command: ``tail –f /var/log/restnoded/restnoded.log``


Quick Start Example
-------------------

Here is an example declaration for Microsoft Azure.

.. literalinclude:: ../../examples/declarations/quickstart.json
   :language: json
   :tab-width: 4

:fonticon:`fa fa-download` :download:`quickstart.json <../../examples/declarations/quickstart.json>`

|

You will receive a response from Postman that looks like this example:

.. code-block:: json

    {
      "message": "success",
      "declaration": "..."
    }





.. |github| raw:: html

   <a href="https://github.com/f5devcentral/f5-cloud-failover-extension/releases" target="_blank">F5 Cloud Failover Extension site on GitHub</a>

   
.. |known-issues| raw:: html

   <a href="https://github.com/F5Devcentral/f5-cloud-failover-extension/issues" target="_blank">Known Issues on GitHub</a>

