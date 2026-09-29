# Ruumble plugin for Mumble (AP6). Separate CMake project; Mumble itself is not built.
# The Mumble header comes unmodified from third_party/mumble (ADR-0009).
cmake_minimum_required(VERSION 3.20)
project(ruumble_plugin VERSION 0.5.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(RUUMBLE_TESTS "Build unit tests" ON)

include(FetchContent)
FetchContent_Declare(nlohmann_json URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
set(USE_TLS ON CACHE BOOL "" FORCE)
set(USE_ZLIB OFF CACHE BOOL "" FORCE)
set(IXWEBSOCKET_INSTALL OFF CACHE BOOL "" FORCE)
if(WIN32)
  # Windows: Mbed TLS, built along; IXWebSocket reads the Windows root store for caFile "SYSTEM"
  set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
  set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
  set(GEN_FILES OFF CACHE BOOL "" FORCE)
  set(MBEDTLS_FATAL_WARNINGS OFF CACHE BOOL "" FORCE)
  FetchContent_Declare(mbedtls URL https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-3.6.7/mbedtls-3.6.7.tar.bz2 DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
  FetchContent_MakeAvailable(mbedtls)
  set(USE_MBED_TLS ON CACHE BOOL "" FORCE)
  set(USE_OPEN_SSL OFF CACHE BOOL "" FORCE)
  set(MBEDTLS_FOUND TRUE)
  set(MBEDTLS_INCLUDE_DIRS "${mbedtls_SOURCE_DIR}/include")
  set(MBEDTLS_LIBRARIES mbedtls mbedx509 mbedcrypto)
else()
  set(USE_OPEN_SSL ON CACHE BOOL "" FORCE)
endif()
FetchContent_Declare(ixwebsocket GIT_REPOSITORY https://github.com/machinezone/IXWebSocket.git GIT_TAG v12.0.1 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(nlohmann_json ixwebsocket)

find_package(Threads REQUIRED)

# Core without Mumble dependency (also used by the tests)
add_library(ruumble_core STATIC src/core.cpp src/config.cpp src/discovery.cpp src/messages.cpp)
target_include_directories(ruumble_core PUBLIC src)
target_link_libraries(ruumble_core PUBLIC nlohmann_json::nlohmann_json Threads::Threads)
if(WIN32)
  target_link_libraries(ruumble_core PUBLIC shell32 ole32 uuid) # ShellExecuteW, SHGetKnownFolderPath, FOLDERID_*
endif()
target_compile_options(ruumble_core PRIVATE -Wall -Wextra)

add_library(ruumble MODULE src/plugin.cpp src/net.cpp)
target_include_directories(ruumble PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/mumble/plugins)
target_link_libraries(ruumble PRIVATE ruumble_core ixwebsocket -static-libstdc++ -static-libgcc)
if(WIN32)
  # MinGW: also libwinpthread statically, so that ruumble.dll needs no DLLs besides the Windows ones
  set_target_properties(ruumble PROPERTIES PREFIX "")
  target_link_options(ruumble PRIVATE -static)
endif()
target_compile_definitions(ruumble PRIVATE
  RUUMBLE_VERSION="${PROJECT_VERSION}"
  RUUMBLE_VERSION_MAJOR=${PROJECT_VERSION_MAJOR} RUUMBLE_VERSION_MINOR=${PROJECT_VERSION_MINOR} RUUMBLE_VERSION_PATCH=${PROJECT_VERSION_PATCH})
target_compile_options(ruumble PRIVATE -Wall -Wextra)
# make only the mumble_* exports visible
target_link_options(ruumble PRIVATE -Wl,--exclude-libs,ALL)

if(RUUMBLE_TESTS)
  FetchContent_Declare(doctest URL https://github.com/doctest/doctest/archive/refs/tags/v2.5.3.tar.gz DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
  FetchContent_MakeAvailable(doctest)
  enable_testing()
  add_executable(ruumble_tests test/core_test.cpp)
  target_link_libraries(ruumble_tests PRIVATE ruumble_core doctest::doctest)
  if(WIN32)
    target_link_options(ruumble_tests PRIVATE -static) # runs under Wine without MinGW DLLs
  endif()
  add_test(NAME ruumble_tests COMMAND ruumble_tests)
endif()

# Bundle for Mumble's plugin installer (Analyse 2.1): ruumble-<version>.mumble_plugin.
# Mumble picks the library of its own platform, so one bundle can carry Linux and Windows:
# RUUMBLE_BUNDLE_EXTRA adds the library built for the other platform (see deploy/Dockerfile).
set(RUUMBLE_BUNDLE_EXTRA "" CACHE FILEPATH "plugin library of the other platform to add to the bundle (ruumble.dll or libruumble.so)")
set(BUNDLE "${CMAKE_BINARY_DIR}/ruumble-${PROJECT_VERSION}.mumble_plugin")
set(BUNDLE_DIR "${CMAKE_BINARY_DIR}/bundle")
if(WIN32)
  set(PLUGIN_FILES ruumble.dll)
  set(PLUGIN_ASSETS "    <plugin os=\"windows\" arch=\"x64\">ruumble.dll</plugin>\n")
else()
  set(PLUGIN_FILES libruumble.so)
  set(PLUGIN_ASSETS "    <plugin os=\"linux\" arch=\"x64\">libruumble.so</plugin>\n")
endif()
set(COPY_EXTRA "")
if(RUUMBLE_BUNDLE_EXTRA)
  get_filename_component(EXTRA_NAME "${RUUMBLE_BUNDLE_EXTRA}" NAME)
  if(EXTRA_NAME MATCHES "\\.dll$")
    string(APPEND PLUGIN_ASSETS "    <plugin os=\"windows\" arch=\"x64\">${EXTRA_NAME}</plugin>\n")
  else()
    string(APPEND PLUGIN_ASSETS "    <plugin os=\"linux\" arch=\"x64\">${EXTRA_NAME}</plugin>\n")
  endif()
  list(APPEND PLUGIN_FILES "${EXTRA_NAME}")
  set(COPY_EXTRA COMMAND ${CMAKE_COMMAND} -E copy "${RUUMBLE_BUNDLE_EXTRA}" "${BUNDLE_DIR}/${EXTRA_NAME}")
endif()
configure_file(packaging/manifest.xml.in "${BUNDLE_DIR}/manifest.xml" @ONLY)
add_custom_command(OUTPUT "${BUNDLE}"
  COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:ruumble> "${BUNDLE_DIR}/$<TARGET_FILE_NAME:ruumble>"
  ${COPY_EXTRA}
  COMMAND ${CMAKE_COMMAND} -E rm -f "${BUNDLE}"
  COMMAND ${CMAKE_COMMAND} -E chdir "${BUNDLE_DIR}" ${CMAKE_COMMAND} -E tar cf "${BUNDLE}" --format=zip manifest.xml ${PLUGIN_FILES}
  DEPENDS ruumble "${BUNDLE_DIR}/manifest.xml" ${RUUMBLE_BUNDLE_EXTRA})
add_custom_target(bundle ALL DEPENDS "${BUNDLE}")
