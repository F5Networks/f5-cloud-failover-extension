#!/usr/bin/env bash


######################
echo "*** Configuring SSH"
eval $(ssh-agent -s)
test "$GIT_SSH_USER_PRIVATE_KEY" && (echo "$GIT_SSH_USER_PRIVATE_KEY" | tr -d '\r' | ssh-add -)
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "$GIT_SSH_USER_PUBLIC_KEY" >> ~/.ssh/id_rsa.pub
echo -e "Host *\n\tStrictHostKeyChecking no\n\n" > ~/.ssh/config
git config user.name $GITLAB_USER_LOGIN
git config user.email $GITLAB_USER_EMAIL
######################

RELEASE_VERSION=$(echo $CI_COMMIT_REF_NAME | awk -F"-" '{ print $2 }')
RELEASE_VERSION_SHORT=$(echo $RELEASE_VERSION | awk -F"v" '{ print $2 }')
RELEASE_BUILD=$(echo $CI_COMMIT_REF_NAME | awk -F"-" '{ print $3 }')
ALLOWED_DIRS=(.github contributing diagrams docs examples sdk specs src test)
ALLOWED_FILES=(.gitallowed .gitattributes .gitignore Dockerfile f5-cloud-failover.spec files_blacklist.yml LICENSE make.bat Makefile package-lock.json package.json README.md requirements.txt SUPPORT.md)

echo "*** Setting git origin"
git remote rm origin && git remote add origin git@github.com:f5networks/f5-cloud-failover-extension.git
echo "*** Removing everything from local git"
git rm -rf .

echo "*** Adding allowed directories"
for dir in "${ALLOWED_DIRS[@]}"; do
    git checkout HEAD ${dir}
    git add ${dir}
done

echo "*** Adding allowed files"
for file in "${ALLOWED_FILES[@]}"; do
    git checkout HEAD ${file}
    git add ${file}
done

echo "*** Committing source code"
git status
git commit -m "Release commited to $RELEASE_VERSION tag" || echo "No changes, nothing to commit!"
git push -u origin HEAD:master -f

echo "*** Publishing tag"
git tag -a $RELEASE_VERSION -m "Release of version $RELEASE_VERSION"
git push origin $RELEASE_VERSION

echo "*** Creating release using GIT APIs"
git config --global github.token $GITHUB_API_TOKEN

echo "*** Getting release info"
release_description=$(curl -sk --header "PRIVATE-TOKEN: $GITLAB_PRIVATE_TOKEN_AK" "https://${GITLAB_API_URL_CFE}/releases/$CI_COMMIT_REF_NAME" | jq .description)
echo "*** Release description: $release_description"
version=$RELEASE_VERSION

generate_post_data()
{
  cat <<EOF
{
  "tag_name": "$version",
  "target_commitish": "master",
  "name": "$version",
  "body": $release_description,
  "draft": false,
  "prerelease": false
}
EOF
}

echo "*** Create release $version"
release_id=$(curl -H "Authorization: token $GITHUB_API_TOKEN" -X POST -d "$(generate_post_data)" "https://api.github.com/repos/f5networks/f5-cloud-failover-extension/releases" | jq .id)

echo "*** Uploading RPM to release page"
echo "*** Calculating content length in bytes for RPM"
RPM_NAME=f5-cloud-failover-$RELEASE_VERSION_SHORT-$RELEASE_BUILD.noarch.rpm
RPM_LOCATION=./dist/new_build/f5-cloud-failover-$RELEASE_VERSION_SHORT-$RELEASE_BUILD.noarch.rpm
CONTENT_LENGTH=$(wc -c < $RPM_LOCATION)
curl --header "Authorization: token $GITHUB_API_TOKEN" --header "Content-Length:$CONTENT_LENGTH" --header "Content-Type:application/zip" --upload-file $RPM_LOCATION -X POST "https://uploads.github.com/repos/f5networks/f5-cloud-failover-extension/releases/$release_id/assets?name=$RPM_NAME"

echo "*** Uploading RPM SHA256 to release page"
SHA_NAME=f5-cloud-failover-$RELEASE_VERSION_SHORT-$RELEASE_BUILD.noarch.rpm.sha256
SHA_LOCATION=./dist/new_build/f5-cloud-failover-$RELEASE_VERSION_SHORT-$RELEASE_BUILD.noarch.rpm.sha256
curl --header "Authorization: token $GITHUB_API_TOKEN" --header "Content-Type:application/txt" --upload-file $SHA_LOCATION -X POST "https://uploads.github.com/repos/f5networks/f5-cloud-failover-extension/releases/$release_id/assets?name=$SHA_NAME"

echo "*** Publishing to github is completed."
