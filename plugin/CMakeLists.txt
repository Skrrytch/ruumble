# Ruumble-Plugin für Mumble (AP6). Eigenes CMake-Projekt; Mumble selbst wird nicht gebaut.
# Der Mumble-Header kommt unverändert aus third_party/mumble (ADR-0009).
cmake_minimum_required(VERSION 3.20)
project(ruumble_plugin VERSION 0.4.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(RUUMBLE_TESTS "Unit-Tests bauen" ON)

include(FetchContent)
FetchContent_Declare(nlohmann_json URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
set(USE_TLS ON CACHE BOOL "" FORCE)
set(USE_OPEN_SSL ON CACHE BOOL "" FORCE)
set(USE_ZLIB OFF CACHE BOOL "" FORCE)
set(IXWEBSOCKET_INSTALL OFF CACHE BOOL "" FORCE)
FetchContent_Declare(ixwebsocket GIT_REPOSITORY https://github.com/machinezone/IXWebSocket.git GIT_TAG v12.0.1 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(nlohmann_json ixwebsocket)

find_package(Threads REQUIRED)

# Kern ohne Mumble-Abhängigkeit (auch für die Tests)
add_library(ruumble_core STATIC src/core.cpp src/config.cpp src/discovery.cpp src/messages.cpp)
target_include_directories(ruumble_core PUBLIC src)
target_link_libraries(ruumble_core PUBLIC nlohmann_json::nlohmann_json Threads::Threads)
target_compile_options(ruumble_core PRIVATE -Wall -Wextra)

add_library(ruumble MODULE src/plugin.cpp src/net.cpp)
target_include_directories(ruumble PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../third_party/mumble/plugins)
target_link_libraries(ruumble PRIVATE ruumble_core ixwebsocket -static-libstdc++ -static-libgcc)
target_compile_definitions(ruumble PRIVATE
  RUUMBLE_VERSION="${PROJECT_VERSION}"
  RUUMBLE_VERSION_MAJOR=${PROJECT_VERSION_MAJOR} RUUMBLE_VERSION_MINOR=${PROJECT_VERSION_MINOR} RUUMBLE_VERSION_PATCH=${PROJECT_VERSION_PATCH})
target_compile_options(ruumble PRIVATE -Wall -Wextra)
# nur die mumble_*-Exporte sichtbar machen
target_link_options(ruumble PRIVATE -Wl,--exclude-libs,ALL)

if(RUUMBLE_TESTS)
  FetchContent_Declare(doctest URL https://github.com/doctest/doctest/archive/refs/tags/v2.5.3.tar.gz DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
  FetchContent_MakeAvailable(doctest)
  enable_testing()
  add_executable(ruumble_tests test/core_test.cpp)
  target_link_libraries(ruumble_tests PRIVATE ruumble_core doctest::doctest)
  add_test(NAME ruumble_tests COMMAND ruumble_tests)
endif()

# Bundle für den Plugin-Installer von Mumble (Analyse 2.1): ruumble-<version>.mumble_plugin
set(BUNDLE "${CMAKE_BINARY_DIR}/ruumble-${PROJECT_VERSION}.mumble_plugin")
configure_file(packaging/manifest.xml.in "${CMAKE_BINARY_DIR}/bundle/manifest.xml" @ONLY)
add_custom_command(OUTPUT "${BUNDLE}"
  COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:ruumble> "${CMAKE_BINARY_DIR}/bundle/libruumble.so"
  COMMAND ${CMAKE_COMMAND} -E chdir "${CMAKE_BINARY_DIR}/bundle" ${CMAKE_COMMAND} -E tar cf "${BUNDLE}" --format=zip manifest.xml libruumble.so
  DEPENDS ruumble "${CMAKE_BINARY_DIR}/bundle/manifest.xml")
add_custom_target(bundle ALL DEPENDS "${BUNDLE}")
