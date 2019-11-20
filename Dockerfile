FROM f5devcentral/f5-api-services-gateway

# Add telemetry streaming package
COPY ./src /var/config/rest/iapps/f5-cloud-failover/
COPY ./node_modules /var/config/rest/iapps/f5-cloud-failover/node_modules/

# Define required ports
EXPOSE 443/tcp
EXPOSE 6514/tcp