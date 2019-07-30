#!/bin/bash

# Disable 1nic auto configuration
/usr/bin/setdb provision.1nicautoconfig disable

adminUsername='${admin_username}'
adminPassword='${admin_password}'

# Wait for mcpd ready before attempting to create admin user
checks=0
while [ $checks -lt 120 ]; do echo checking mcpd
    tmsh -a show sys mcp-state field-fmt | grep -q running
    if [ $? == 0 ]; then
        echo mcpd ready
        break
    fi
    echo mcpd not ready yet
    let checks=checks+1
    sleep 10
done

tmsh create auth user $${adminUsername} password $${adminPassword} shell bash partition-access replace-all-with { all-partitions { role admin } }
tmsh save /sys config

# echo that we are done
echo "Admin user provisioned in user_data"