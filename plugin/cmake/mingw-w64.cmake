# Cross build of the Windows plugin (ruumble.dll) on Linux with MinGW-w64 (Debian: g++-mingw-w64-x86-64-posix).
#   cmake -S plugin -B plugin/build-win -DCMAKE_TOOLCHAIN_FILE=plugin/cmake/mingw-w64.cmake -DCMAKE_BUILD_TYPE=Release
# The posix thread model is required for std::thread and std::mutex.
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)
set(CMAKE_C_COMPILER x86_64-w64-mingw32-gcc-posix)
set(CMAKE_CXX_COMPILER x86_64-w64-mingw32-g++-posix)
set(CMAKE_RC_COMPILER x86_64-w64-mingw32-windres)
set(CMAKE_FIND_ROOT_PATH /usr/x86_64-w64-mingw32)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
# Windows 10 or later (LCIDToLocaleName, SHGetKnownFolderPath need Vista+)
add_compile_definitions(_WIN32_WINNT=0x0A00 WINVER=0x0A00)
