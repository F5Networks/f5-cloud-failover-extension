Summary: F5 Cloud Failover Extension
Version: %{_version}
Name: %{_name}
Release: %{_release}
BuildArch: noarch
Group: Development/Tools
License: Commercial
Packager: F5 Networks <support@f5.com>

%description
CLoud Failover for BIG-IP

%define IAPP_INSTALL_DIR /var/config/rest/iapps/%{name}
%define _rpmfilename %%{ARCH}/%%{NAME}-%%{VERSION}-%%{RELEASE}.%%{ARCH}.rpm
%define _unpackaged_files_terminate_build 0

%prep
rm -rf %{_builddir}/*
cp %{main}/src/manifest.json %{_builddir}
cp -r %{main}/src/nodejs %{_builddir}
cp %{main}/package.json %{_builddir}
cp -r %{main}/node_modules %{_builddir}

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}
cp %{_builddir}/manifest.json $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}
cp %{_builddir}/package.json $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}
cp -r %{_builddir}/node_modules $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}
cp -r %{_builddir}/nodejs $RPM_BUILD_ROOT%{IAPP_INSTALL_DIR}

%clean
#rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)
%{IAPP_INSTALL_DIR}
