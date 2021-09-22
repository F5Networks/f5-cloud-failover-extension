i=0
while [ $i -le 50 ]; do
    if [[ "$(curl -u admin:admin --max-time 5 --connect-timeout 5 -s -o /dev/null -w '%{http_code}' http://localhost:8100/mgmt/shared/cloud-failover/info)" == "200" ]]; then
        break;
    fi
    sleep 3
    i=$(( $i + 1 ))
done
curl -u admin:admin --max-time 10 --connect-timeout 10 -d {} -X POST http://localhost:8100/mgmt/shared/cloud-failover/trigger