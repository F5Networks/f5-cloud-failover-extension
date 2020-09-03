#!/usr/bin/env bash
# usage: ./ssh_to_instance.sh primary

INSTANCE_TO_USE=${1:-primary}
PATH_TO_DEPLOYMENT_INFO='deployment_info.json'

INSTANCES=$(cat $PATH_TO_DEPLOYMENT_INFO | jq .instances -r)
USERNAME=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .admin_username' -r)
PASSWORD=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .admin_password' -r)

if [[ "$INSTANCE_TO_USE" == "primary" ]]; then
    HOST=$(echo $INSTANCES | jq '.[] | select(.primary == true) | .mgmt_address' -r)
else
    HOST=$(echo $INSTANCES | jq '.[] | select(.primary == false) | .mgmt_address' -r)
fi

sshpass -p $PASSWORD ssh -o "StrictHostKeyChecking no" ${USERNAME}@${HOST}