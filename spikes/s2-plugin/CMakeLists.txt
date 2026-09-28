# Machbarkeitstest S2: eigenes CMake, Mumble-Header nur über den Include-Pfad (third_party, unverändert).
cmake_minimum_required(VERSION 3.20)
project(ruumble_spike_plugin CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)

find_package(Threads REQUIRED)
add_library(ruumble_spike MODULE src/plugin.cpp)
target_include_directories(ruumble_spike PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../third_party/mumble/plugins)
target_compile_options(ruumble_spike PRIVATE -Wall -Wextra)
target_link_libraries(ruumble_spike PRIVATE Threads::Threads -static-libstdc++ -static-libgcc)
