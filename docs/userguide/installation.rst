.. _installation:

Download and install Cloud Failover Extension
=============================================

The Cloud Failover Extension package is an RPM file you download, and then upload to the BIG-IP system using the iControl/iApp LX framework. Alternatively, you can see the :doc:`quickstart` section.

|

.. _download-rpm:

Download the RPM file
---------------------
The first task is to download the latest RPM file.  Go to the |github|, and download the latest (highest numbered) RPM file, found in the |release|.


.. _verify-rpm:

Verify the integrity of the Cloud Failover Extension RPM package
````````````````````````````````````````````````````````````````
F5 Networks provides a checksum for each Cloud Failover Extension release so you can confirm the integrity of the RPM package.

You can get a checksum for a particular RPM by running one of the following commands, depending on your operating system:

- Linux: ``sha256sum <path_to_rpm>``

- Windows using CertUtil: ``CertUtil –hashfile <path_to_rpm> SHA256``

You can compare the checksum produced by that command against the **.sha256** file (https://github.com/F5Networks/f5-cloud-failover-extension/releases). 

.. WARNING:: Do not continue if the hash does not match.

|

.. _upload-install:

Upload and install the Cloud Failover Extension file on the BIG-IP
------------------------------------------------------------------
After you download the RPM, you must upload and then install it on your BIG-IP system. You can use the BIG-IP Configuration utility or cURL (alternatively, you can use SCP to upload the file to **/var/config/rest/downloads**, but you will still have to use the cURL command to install the package). Use only one of the following procedures.

.. sidebar:: :fonticon:`fa fa-info-circle fa-lg` Version Notice:

   Cloud Failover Extension supports BIG-IP version 14.1.X and later.

.. _installgui-ref:

Install CFE using the BIG-IP Configuration utility
``````````````````````````````````````````````````

From the Configuration utility:

#. Click **iApps > Package Management LX**.

#. Click the **Import** button.

#. Click **Choose File** and then browse to the location you saved the RPM file, and then click **Ok**.

#. Click the **Upload** button.



.. _installcurl-ref:

Install CFE using cURL from the Linux shell
```````````````````````````````````````````

If you want to use cURL to install Cloud Failover Extension, use the following command syntax. 

#. Set the file name and the BIG-IP IP address and credentials, making sure you use the appropriate RPM file name, including build number, and BIG-IP credentials.

   .. code-block:: shell

       FN=f5-cloud-failover-1.0.0-1.noarch.rpm

       CREDS=admin:password

       IP=IP address of BIG-IP



#. Copy the following commands to upload the package. If you uploaded the RPM by another method, you can skip these commands.

   .. code-block:: shell

       LEN=$(wc -c $FN | cut -f 1 -d ' ')

       curl -kvu $CREDS https://$IP/mgmt/shared/file-transfer/uploads/$FN -H 'Content-Type: application/octet-stream' -H "Content-Range: 0-$((LEN - 1))/$LEN" -H "Content-Length: $LEN" -H 'Connection: keep-alive' --data-binary @$FN



#. Copy the following commands to install the package.

   .. code-block:: shell

       DATA="{\"operation\":\"INSTALL\",\"packageFilePath\":\"/var/config/rest/downloads/$FN\"}"


       curl -kvu $CREDS "https://$IP/mgmt/shared/iapp/package-management-tasks" -H "Origin: https://$IP" -H 'Content-Type: application/json;charset=UTF-8' --data $DATA



|

.. include:: /_static/reuse/feedback.rst



.. |github| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension" target="_blank">F5 Cloud Failover Extension site on GitHub</a>

.. |release| raw:: html

   <a href="https://github.com/F5Networks/f5-cloud-failover-extension/releases" target="_blank">Release section</a>
