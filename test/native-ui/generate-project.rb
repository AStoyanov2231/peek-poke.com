require 'xcodeproj'
require 'fileutils'

root = File.expand_path(__dir__)
project_path = File.join(root, 'PeekPokePrivacyAudit.xcodeproj')
FileUtils.rm_rf(project_path)
project = Xcodeproj::Project.new(project_path)

host = project.new_target(:application, 'PeekPokePrivacyAuditHost', :ios, '26.0')
host.build_configurations.each do |configuration|
  configuration.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.peekpoke.privacy-audit-host'
  configuration.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  configuration.build_settings['SDKROOT'] = 'iphonesimulator'
  configuration.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  configuration.build_settings['SWIFT_VERSION'] = '5.0'
end
host_group = project.main_group.new_group('PeekPokePrivacyAuditHost')
host.add_file_references([host_group.new_file(File.join(root, 'AuditHost.swift'))])

ui_test = project.new_target(:ui_test_bundle, 'PeekPokePrivacyAuditUITests', :ios, '26.0')
ui_test.add_dependency(host)
ui_test.build_configurations.each do |configuration|
  configuration.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.peekpoke.privacy-audit-tests'
  configuration.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  configuration.build_settings['SDKROOT'] = 'iphonesimulator'
  configuration.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  configuration.build_settings['SWIFT_VERSION'] = '5.0'
  configuration.build_settings['TEST_TARGET_NAME'] = 'PeekPokePrivacyAuditHost'
end
ui_group = project.main_group.new_group('PeekPokePrivacyAuditUITests')
ui_test.add_file_references([ui_group.new_file(File.join(root, 'PeekPokePrivacyAuditUITests.swift'))])
project.save
