#!/bin/bash

sleep 1m

adminUsername='${admin_username}'
adminPassword='${admin_password}'

tmsh create auth user $${adminUsername} password $${adminPassword} shell bash partition-access replace-all-with { all-partitions { role admin } }
tmsh save /sys config
