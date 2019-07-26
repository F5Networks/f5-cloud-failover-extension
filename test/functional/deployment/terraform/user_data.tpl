#!/bin/bash

sleep 2m

adminUsername='${admin_username}'
adminPassword='${admin_password}'

tmsh create auth user $${adminUsername} password $${adminPassword} shell bash partition-access replace-all-with { all-partitions { role admin } }
tmsh save /sys config

# TODO: Still need / want to echo when this is done?
# echo that we are done - should show up in the /var/log/cloud-init-output.log
echo "Admin user provisioned in userdata"