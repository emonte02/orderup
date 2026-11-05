/* Use the same JavaScript Math primitives as the compatibility layer, without
 * a guest-to-JavaScript trap, ABI decode and register round trip per operation.
 * Nonfinite arguments/results retain the existing host-function fallback. */
#include <stdint.h>
#include <math.h>
#include <emscripten/em_math.h>
int ou_guest_math(uint32_t kind,uint32_t input,uint32_t *result,uint32_t *handled){
 *handled=0;if(kind>=8)return 1;if((input&0x7f800000u)==0x7f800000u)return 0;
 union {uint32_t u;float f;} value={.u=input},out;double x=value.f,y=0;
 switch(kind){case 0:y=emscripten_math_sin(x);break;case 1:y=emscripten_math_cos(x);break;case 2:y=emscripten_math_tan(x);break;case 3:y=emscripten_math_acos(x);break;case 4:y=emscripten_math_asin(x);break;case 5:y=emscripten_math_atan(x);break;case 6:y=ceil(x);break;case 7:y=floor(x);break;}
 out.f=(float)y;if((out.u&0x7f800000u)==0x7f800000u)return 0;*result=out.u;*handled=1;return 0;
}
