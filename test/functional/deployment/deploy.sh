#!/bin/bash
# helper script to deploy infrastructure based on environment
# usage: ./deploy.sh azure

environment=${1:-azure}
action=${2:-create}
script_location=$(dirname "$0")

# install python dependencies
python3 -m venv venv && source venv/bin/activate
pip install -r ${script_location}/requirements.txt

# support create|delete|show
if [[ ${action} == "create" ]]; then
    terraform init ${script_location}/terraform/${environment}
    terraform apply -auto-approve ${script_location}/terraform/${environment}
    terraform output -json
elif [[ ${action} == "delete" ]]; then
    terraform destroy -auto-approve ${script_location}/terraform/${environment}
elif [[ ${action} == "show" ]]; then
    terraform output -json
else
    echo "Unknown action: ${action}"
    exit 1
fi

# perform any cleanup necessary
deactivate && rm -rf venv