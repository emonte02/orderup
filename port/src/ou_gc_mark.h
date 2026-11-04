#ifndef OU_GC_MARK_H
#define OU_GC_MARK_H
#include <stdint.h>
#include <unicorn/unicorn.h>
typedef struct OUGC OUGC;
OUGC *ou_gc_create(uc_engine *,const uint32_t bindings[10],uint32_t resume);
int ou_assoc_find(OUGC *,uint32_t,uint32_t,uint32_t);
void ou_gc_bind_menu_find(OUGC *,const uint32_t[2]);
int ou_menu_find(OUGC *,uint32_t,uint32_t,uint32_t);
void ou_gc_bind_menu_marks(OUGC *,const uint32_t[2]);
void ou_gc_bind_script_marks(OUGC *,const uint32_t[4]);
void ou_gc_script_marks_enable(OUGC *,uint32_t);
void ou_gc_bind_machine(OUGC *,const uint32_t callbacks[16]);
int ou_gc_enter(OUGC *,uint32_t object,uint32_t kind);
int ou_gc_continue(OUGC *);
double ou_gc_phase_ms(OUGC *,uint32_t,uint32_t);
void ou_gc_phase_reset(OUGC *);
uint32_t ou_gc_count(OUGC *,uint32_t index);
void ou_gc_destroy(OUGC *);
#endif
