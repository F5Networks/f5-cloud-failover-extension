#!/usr/bin/env bash
# usage: ./ssh_to_instance.sh primary

PATH_TO_DEPLOYMENT_INFO='deployment_info.json'

INSTANCES=$(cat $PATH_TO_DEPLOYMENT_INFO | jq .instances -r)
USERNAME=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .admin_username' -r)
PASSWORD=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .admin_password' -r)

echo "Determining ACTIVE host in HA pair"
HOST=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .mgmt_address' -r)
RESPONSE=$(sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" ${USERNAME}@${HOST} "bash -c 'tmsh show cm failover-status | grep ACTIVE'")
if [[ $RESPONSE == *"ACTIVE"* ]]; then
    echo "$HOST is ACTIVE"
else
    HOST=$(echo $INSTANCES | jq '.[] | select(.primary == false) | .mgmt_address' -r)
    echo "$HOST is ACTIVE"
fi

echo "Triggering failover on host: ${HOST}"
sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" ${USERNAME}@${HOST} "bash -c 'tmsh run /sys failover standby'"
echo "Failover completed"
