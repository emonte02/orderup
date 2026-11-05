#ifndef OU_GFX_CONSTANTS_H
#define OU_GFX_CONSTANTS_H
#include <stdint.h>
#include <unicorn/unicorn.h>
typedef struct OUGfxConstants OUGfxConstants;
OUGfxConstants *ou_gfx_constants_create(uc_engine *,uint32_t,const uint32_t[6]);
int ou_gfx_constants_enter(OUGfxConstants *,uint32_t);
int ou_gfx_constants_continue(OUGfxConstants *);
void ou_gfx_state_bind(OUGfxConstants *,const uint32_t[5]);
int ou_gfx_state_tail(OUGfxConstants *,uint32_t,uint32_t[4]);
int ou_gfx_state_texture(OUGfxConstants *,uint32_t[4]);
uint32_t ou_gfx_state_count(OUGfxConstants *,uint32_t);
int ou_gfx_constants_pure(OUGfxConstants *,uint32_t,uint32_t[4]);
void ou_gfx_matrix_bind(OUGfxConstants *,const uint32_t[3]);
int ou_gfx_matrix_enter(OUGfxConstants *,const uint32_t[4]);
int ou_gfx_matrix_value(OUGfxConstants *,uint32_t,uint32_t);
uint32_t ou_gfx_constants_count(OUGfxConstants *);
void ou_gfx_constants_destroy(OUGfxConstants *);
#endif
