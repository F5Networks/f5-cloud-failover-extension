Summary: F5 Cloud Failover 0.9.0 Extension
Version: 0.9.0
Name: %{_name}
Release: %{_release}
BuildArch: noarch
Group: Development/Tools
License: Commercial
Packager: F5 Networks <support@f5.com>

%description
CLoud Failover for BIG-IP

%define IAPP_INSTALL_DIR /var/config/rest/iapps/%{_name}

%prep
mkdir -p %{_builddir}/src/nodejs/
cp -r %{main}/src/ %{_builddir}/
if [ -d "%{main}/node_modules" ] ; then cp -r %{main}/node_modules %{_builddir}/src/nodejs/ ; fi
echo -n %{_version}-%{_release} > %{_builddir}/src/version

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}
cp -r %{_builddir}/src/* $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)
%{IAPP_INSTALL_DIR}
