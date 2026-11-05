#ifndef OU_FONT_H
#define OU_FONT_H
#include <stdint.h>
#include <unicorn/unicorn.h>
/* Original ordinary-text layout loop, guarded against aliases and custom
 * virtual font methods. Markup and unusual FP modes remain original ARM. */
int ou_font_layout(uc_engine *,const uint32_t targets[5],uint32_t *handled);
#endif
