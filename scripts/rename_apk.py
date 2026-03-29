import sys, os

code = sys.argv[1]
src = 'android/app/build/outputs/apk/debug/app-debug.apk'
dst = f'android/app/build/outputs/apk/debug/V{code}근무편성.apk'
os.rename(src, dst)
print(dst)
