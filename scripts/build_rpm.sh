#!/bin/bash

set -e

MAINDIR=$(pwd)
FINALBUILDDIR=${MAINDIR}/dist/new_build
mkdir -p ${FINALBUILDDIR}
RELEASE=$(($(ls -v dist/*.rpm|tail -1|sed -En 's/.*-([0-9]+).noarch.rpm/\1/p') + 1))
PKG_NAME=$(cat ${MAINDIR}/package.json | jq .name -r)

rpmbuild -bb --define "main $(pwd)" --define '_topdir %{main}/rpmbuild' --define "_name ${PKG_NAME}" --define "_release ${RELEASE}" project.spec
cd rpmbuild/RPMS/noarch
FN=$(ls -t *.rpm 2>/dev/null | head -1)
cp ${FN} ${FINALBUILDDIR}
sha256sum "${FN}" > "${FINALBUILDDIR}/${FN}.sha256"

cd ${MAINDIR}
rm -rf rpmbuild/
echo "RPM FILE ${FINALBUILDDIR}/${FN}"