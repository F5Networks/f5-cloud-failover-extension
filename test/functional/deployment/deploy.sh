#!/bin/bash

# Script to deploy infrastructure based on environment
# Usage: ./deploy.sh --environment azure --action create

# logs an error and exits
# usage: log_error_and_exit message
function log_error_and_exit() {
    echo "Error: ${1}"
    exit 1
}

# Define any global variables
script_location=$(dirname "$0")
help=false
environment=""
action="create"
tf_vars_file="terraform.tfvars"

# Define command line usage help
read -r -d '' USAGE << EOM
    Usage: $0
        --help                      Print usage message and exit
        --environment <string>      Environment to deploy into: azure, aws, gcp
        --action <string>           Action to take: create, delete, show
        --project-id <string>       Environment project ID, required for some environments

EOM

# Parse command line arguments
while [[ $# -gt 0 ]] ; do
    case "$1" in
        --help)
            help=true
            shift ;;
        --environment)
            environment="$2"
            shift 2 ;;
        --action)
            action="$2"
            shift 2 ;;
        --project-id)
            project_id="$2"
            shift 2 ;;
        *|--)
            shift
            break ;;
    esac
done

set -e

if $help ; then
    echo "$USAGE"
    exit
fi

# cleanup any file(s) from previous runs
rm -f ${tf_vars_file}

# perform any input validation
if [[ -z "$environment" ]]; then
  log_error_and_exit "'environment' must be provided"
fi
if [[ ${environment} == "gcp" ]]; then
    # check for required GCP project ID, via parameter or environment variable
    project_id="${project_id:-$GOOGLE_PROJECT_ID}"
    if [[ -z "${project_id}" ]]; then
        log_error_and_exit "Project ID must be provided, using environment variable 'GOOGLE_PROJECT_ID'"
    fi
    echo "project_id = \"${project_id}\"" >> ${tf_vars_file}
fi
if [[ -z "$ARTIFACTORY_SERVER" ]]; then
    log_error_and_exit "Environment variable 'ARTIFACTORY_SERVER' must be provided"
fi

# install python dependencies
python3 -m venv venv && source venv/bin/activate
pip install -r ${script_location}/requirements.txt

# note: running on linux/unix may require sudo
tf_command=""
if [[ ${USE_SUDO} == "true" ]]; then
    echo "Using sudo, expect a password prompt."
  tf_command+="sudo "
fi
tf_command+="terraform"

# handle some required terraform normalization
if [[ -n "$CF_ENV_USE_AVAILABILITY_ZONES" ]]; then
    echo "use_availability_zones = \"${CF_ENV_USE_AVAILABILITY_ZONES}\"" >> ${tf_vars_file}
fi

# supported actions: create, delete, show
if [[ ${action} == "create" ]]; then
    ${tf_command} init ${script_location}/terraform/${environment}
    ${tf_command} apply -auto-approve ${script_location}/terraform/${environment}
    ${tf_command} output -json
    echo $(${tf_command} output -json) | jq .deployment_info.value -r > deployment_info.json
elif [[ ${action} == "delete" ]]; then
    ${tf_command} init ${script_location}/terraform/${environment}
    ${tf_command} destroy -auto-approve ${script_location}/terraform/${environment}
elif [[ ${action} == "show" ]]; then
    ${tf_command} output -json
    echo $(${tf_command} output -json) | jq .deployment_info.value -r > deployment_info.json
else
    log_error_and_exit "Unknown action: ${action}"
fi

# perform any cleanup necessary
deactivate && rm -rf venv